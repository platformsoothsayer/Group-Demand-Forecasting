/**
 * Browser runtime. Decodes the reconciled sample paths, applies a scenario and aggregates any node of the
 * hierarchy from the bottom level, so every level always adds up. No model fitting happens here.
 */
import type { History, World } from "./types";
import type { ForecastFile } from "./forecastFile";
import { buildNodes, nodeId, type HNode } from "./reconcile";
import { scenarioFactors, scenarioKey, type Scenario } from "./scenario";

export interface NodeStats {
  /** Central forecast: mean of the reconciled paths (additive across levels). Shown as P50. */
  mean: number[];
  q10: number[];
  q25: number[];
  q75: number[];
  q90: number[];
  /** Expected revenue at MSRP and forecast trim mix. */
  revenue: number[];
}

export function quantileSorted(a: Float64Array, q: number): number {
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

export class Engine {
  readonly H: number;
  readonly nP: number;
  readonly tEnd: number;
  readonly nodes: HNode[];
  readonly nodeById: Map<string, HNode>;
  /** Reconciled baseline paths per bottom series, index h * nP + j. */
  readonly basePaths: Float32Array[];
  readonly baseMean: number[][];
  /** Expected price per bottom series and forecast month (MSRP at the forecast trim mix). */
  readonly price: number[][];
  readonly brandOf: Record<string, string>;
  private histCache = new Map<string, number[]>();
  private histByIdx: number[][];
  private runs = new Map<string, ScenarioRun>();

  constructor(
    readonly world: World,
    readonly history: History,
    readonly fc: ForecastFile,
  ) {
    this.H = fc.horizon;
    this.nP = fc.nPaths;
    this.tEnd = fc.tEnd;
    this.nodes = buildNodes(world, fc.series.map((s) => ({ store: s.store, model: s.model })));
    this.nodeById = new Map(this.nodes.map((n) => [n.id, n]));
    const hmap = new Map(history.series.map((x) => [`${x.store}|${x.model}`, x.sales]));
    this.histByIdx = fc.series.map((s) => hmap.get(`${s.store}|${s.model}`)!);
    this.brandOf = Object.fromEntries(world.models.map((m) => [m.id, m.brand]));
    this.basePaths = fc.series.map((s) => {
      const a = new Float32Array(this.H * this.nP);
      for (let h = 0; h < this.H; h++) {
        const d = s.delta[h];
        const p = s.paths[h];
        for (let j = 0; j < this.nP; j++) a[h * this.nP + j] = Math.max(0, p[j] + d);
      }
      return a;
    });
    this.baseMean = this.basePaths.map((a) =>
      Array.from({ length: this.H }, (_, h) => {
        let s = 0;
        for (let j = 0; j < this.nP; j++) s += a[h * this.nP + j];
        return s / this.nP;
      }),
    );
    const modelById = Object.fromEntries(world.models.map((m) => [m.id, m]));
    this.price = fc.series.map((s) => s.trim.map((sh) => sh.reduce((acc, p, k) => acc + p * modelById[s.model].msrpBase * world.trimSteps[k], 0)));
  }

  node(id: string): HNode {
    const n = this.nodeById.get(id);
    if (!n) throw new Error(`unknown node ${id}`);
    return n;
  }

  /** Monthly actual sales of a node, t = 0 .. tEnd. */
  actuals(id: string): number[] {
    let h = this.histCache.get(id);
    if (!h) {
      const n = this.node(id);
      h = new Array(this.tEnd + 1).fill(0);
      for (const i of n.bottoms) {
        const s = this.historyOf(i);
        for (let t = 0; t <= this.tEnd; t++) h[t] += s[t];
      }
      this.histCache.set(id, h);
    }
    return h;
  }

  historyOf(i: number): number[] {
    return this.histByIdx[i];
  }

  run(s: Scenario): ScenarioRun {
    const key = scenarioKey(s);
    let r = this.runs.get(key);
    if (!r) {
      r = new ScenarioRun(this, s);
      if (this.runs.size > 12) this.runs.delete(this.runs.keys().next().value as string);
      this.runs.set(key, r);
    }
    return r;
  }

  /** Resolve a selection (brand, model, dealership) to a node id. */
  resolve(sel: { brand?: string | null; model?: string | null; store?: string | null }): string {
    const { brand, model, store } = sel;
    if (model) return store ? nodeId.storeModel(store, model) : nodeId.model(model);
    if (brand) return store ? nodeId.storeBrand(store, brand) : nodeId.brand(brand);
    if (store) return nodeId.store(store);
    return nodeId.group();
  }
}

export class ScenarioRun {
  readonly factors: number[][];
  readonly paths: Float32Array[];
  readonly mean: number[][];
  private cache = new Map<string, NodeStats>();
  readonly computeMs: number;

  constructor(
    readonly engine: Engine,
    readonly scenario: Scenario,
  ) {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const { H, nP } = engine;
    this.factors = scenarioFactors(engine.fc, engine.world, scenario);
    this.paths = engine.basePaths.map((base, i) => {
      const f = this.factors[i];
      if (f.every((x) => x === 1)) return base;
      const a = new Float32Array(H * nP);
      for (let h = 0; h < H; h++) for (let j = 0; j < nP; j++) a[h * nP + j] = base[h * nP + j] * f[h];
      return a;
    });
    this.mean = engine.baseMean.map((m, i) => m.map((v, h) => v * this.factors[i][h]));
    // Precompute every node so the whole app reads from one consistent state.
    for (const n of engine.nodes) this.stats(n.id);
    this.computeMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
  }

  stats(id: string): NodeStats {
    let s = this.cache.get(id);
    if (s) return s;
    const e = this.engine;
    const n = e.node(id);
    const { H, nP } = e;
    const sum = new Float64Array(nP);
    s = { mean: [], q10: [], q25: [], q75: [], q90: [], revenue: [] };
    for (let h = 0; h < H; h++) {
      sum.fill(0);
      let mean = 0;
      let rev = 0;
      for (const i of n.bottoms) {
        const p = this.paths[i];
        const off = h * nP;
        for (let j = 0; j < nP; j++) sum[j] += p[off + j];
        mean += this.mean[i][h];
        rev += this.mean[i][h] * e.price[i][h];
      }
      sum.sort();
      s.mean.push(mean);
      s.q10.push(quantileSorted(sum, 0.1));
      s.q25.push(quantileSorted(sum, 0.25));
      s.q75.push(quantileSorted(sum, 0.75));
      s.q90.push(quantileSorted(sum, 0.9));
      s.revenue.push(rev);
    }
    this.cache.set(id, s);
    return s;
  }

  /** Sum of a node's paths over a set of months, sorted, for range of multi-month totals. */
  totalRange(id: string, months: number[]): { mean: number; q10: number; q90: number } {
    const e = this.engine;
    const n = e.node(id);
    const sum = new Float64Array(e.nP);
    let mean = 0;
    for (const i of n.bottoms) {
      for (const h of months) {
        const off = h * e.nP;
        const p = this.paths[i];
        for (let j = 0; j < e.nP; j++) sum[j] += p[off + j];
        mean += this.mean[i][h];
      }
    }
    sum.sort();
    return { mean, q10: quantileSorted(sum, 0.1), q90: quantileSorted(sum, 0.9) };
  }
}

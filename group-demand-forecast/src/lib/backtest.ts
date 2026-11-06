/**
 * Rolling-origin backtest. Six forecast origins over the last 12 months, horizons 1 to 3 months.
 * At each origin the full pipeline is refitted on data up to the origin only (market indicators held at their
 * last value, leads on their baseline path, planned campaign calendar known). Series need 3 months of history.
 * Compared with a seasonal naive forecast (same month last year, last value if less than 12 months) and a
 * 3-month moving average. WAPE = sum|F - A| / sum A. Bias = sum(F - A) / sum A.
 */
import type { History, World } from "./types";
import { runPipeline } from "./model";

export type BtLevel = "group" | "brand" | "model" | "storeModel";
export type BtMethod = "ai" | "seasonalNaive" | "movingAverage";
export const BT_LEVELS: BtLevel[] = ["group", "brand", "model", "storeModel"];
export const BT_METHODS: BtMethod[] = ["ai", "seasonalNaive", "movingAverage"];

export interface BtMetric {
  wape: number;
  bias: number;
  n: number;
}

export interface BtOriginChart {
  origin: number;
  months: number[];
  actual: number[];
  ai: number[];
  p10: number[];
  p90: number[];
  seasonalNaive: number[];
  movingAverage: number[];
}

export interface BacktestResult {
  origins: number[];
  horizons: number[];
  metrics: Record<BtLevel, Record<BtMethod, BtMetric>>;
  coverage: Record<BtLevel, number>;
  coverageByHorizon: number[];
  wapeByHorizon: Record<BtMethod, number[]>;
  /** AI accuracy (1 - WAPE) by origin at dealership x model level. */
  accuracyByOrigin: number[];
  charts: BtOriginChart[];
}

function quantile(sorted: Float64Array, q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function runBacktest(world: World, history: History, o: { origins?: number[]; nPaths?: number; seed: number }): BacktestResult {
  const origins = o.origins ?? [22, 24, 26, 28, 30, 32];
  const nPaths = o.nPaths ?? 300;
  const HZ = 3;
  const acc: Record<BtLevel, Record<BtMethod, { abs: number; err: number; act: number; n: number }>> = {} as never;
  const cov: Record<BtLevel, { hit: number; n: number }> = {} as never;
  for (const lv of BT_LEVELS) {
    acc[lv] = {} as never;
    for (const m of BT_METHODS) acc[lv][m] = { abs: 0, err: 0, act: 0, n: 0 };
    cov[lv] = { hit: 0, n: 0 };
  }
  const covH = Array.from({ length: HZ }, () => ({ hit: 0, n: 0 }));
  const wH: Record<BtMethod, { abs: number; act: number }[]> = {
    ai: Array.from({ length: HZ }, () => ({ abs: 0, act: 0 })),
    seasonalNaive: Array.from({ length: HZ }, () => ({ abs: 0, act: 0 })),
    movingAverage: Array.from({ length: HZ }, () => ({ abs: 0, act: 0 })),
  };
  const accuracyByOrigin: number[] = [];
  const charts: BtOriginChart[] = [];

  for (const origin of origins) {
    const res = runPipeline(world, history, origin, { nPaths, seed: o.seed + origin, minHist: 3 });
    const { ctx, nodes } = res;
    const recon = res.rawPaths.map((ser, i) => ser.slice(0, HZ).map((arr, h) => Float64Array.from(arr, (v) => Math.max(0, v + res.delta[i][h]))));
    const sn = ctx.series.map((s) =>
      Array.from({ length: HZ }, (_, h) => {
        const t = origin + 1 + h;
        return s.startT <= t - 12 ? s.sales[t - 12] : s.sales[origin];
      }),
    );
    const ma = ctx.series.map((s) => (s.sales[origin] + s.sales[origin - 1] + s.sales[origin - 2]) / 3);
    let oAbs = 0;
    let oAct = 0;
    for (const node of nodes) {
      const lv = node.level as BtLevel;
      if (!BT_LEVELS.includes(lv)) continue;
      for (let h = 0; h < HZ; h++) {
        const t = origin + 1 + h;
        const A = node.bottoms.reduce((a, i) => a + ctx.series[i].sales[t], 0);
        const sum = new Float64Array(nPaths);
        for (const i of node.bottoms) {
          const p = recon[i][h];
          for (let j = 0; j < nPaths; j++) sum[j] += p[j];
        }
        const F = sum.reduce((a, b) => a + b, 0) / nPaths;
        sum.sort();
        const lo = quantile(sum, 0.1);
        const hi = quantile(sum, 0.9);
        const fc: Record<BtMethod, number> = {
          ai: F,
          seasonalNaive: node.bottoms.reduce((a, i) => a + sn[i][h], 0),
          movingAverage: node.bottoms.reduce((a, i) => a + ma[i], 0),
        };
        for (const m of BT_METHODS) {
          acc[lv][m].abs += Math.abs(fc[m] - A);
          acc[lv][m].err += fc[m] - A;
          acc[lv][m].act += A;
          acc[lv][m].n += 1;
          if (lv === "storeModel") {
            wH[m][h].abs += Math.abs(fc[m] - A);
            wH[m][h].act += A;
          }
        }
        const hit = A >= lo - 1e-9 && A <= hi + 1e-9 ? 1 : 0;
        cov[lv].hit += hit;
        cov[lv].n += 1;
        if (lv === "storeModel") {
          covH[h].hit += hit;
          covH[h].n += 1;
          oAbs += Math.abs(F - A);
          oAct += A;
        }
      }
    }
    accuracyByOrigin.push(1 - oAbs / oAct);
    // group chart for this origin
    const g = nodes.find((n) => n.level === "group")!;
    const months: number[] = [];
    for (let t = origin - 11; t <= origin + HZ; t++) months.push(t);
    const chart: BtOriginChart = { origin, months, actual: [], ai: [], p10: [], p90: [], seasonalNaive: [], movingAverage: [] };
    for (const t of months) chart.actual.push(g.bottoms.reduce((a, i) => a + ctx.series[i].sales[t], 0));
    for (let h = 0; h < HZ; h++) {
      const sum = new Float64Array(nPaths);
      for (const i of g.bottoms) for (let j = 0; j < nPaths; j++) sum[j] += recon[i][h][j];
      chart.ai.push(sum.reduce((a, b) => a + b, 0) / nPaths);
      sum.sort();
      chart.p10.push(quantile(sum, 0.1));
      chart.p90.push(quantile(sum, 0.9));
      chart.seasonalNaive.push(g.bottoms.reduce((a, i) => a + sn[i][h], 0));
      chart.movingAverage.push(g.bottoms.reduce((a, i) => a + ma[i], 0));
    }
    charts.push(chart);
  }
  const metrics = {} as Record<BtLevel, Record<BtMethod, BtMetric>>;
  const coverage = {} as Record<BtLevel, number>;
  for (const lv of BT_LEVELS) {
    metrics[lv] = {} as never;
    for (const m of BT_METHODS) {
      const a = acc[lv][m];
      metrics[lv][m] = { wape: a.abs / a.act, bias: a.err / a.act, n: a.n };
    }
    coverage[lv] = cov[lv].hit / cov[lv].n;
  }
  return {
    origins,
    horizons: [1, 2, 3],
    metrics,
    coverage,
    coverageByHorizon: covH.map((c) => c.hit / c.n),
    wapeByHorizon: {
      ai: wH.ai.map((x) => x.abs / x.act),
      seasonalNaive: wH.seasonalNaive.map((x) => x.abs / x.act),
      movingAverage: wH.movingAverage.map((x) => x.abs / x.act),
    },
    accuracyByOrigin,
    charts,
  };
}

/**
 * Driver decomposition (LMDI, log mean Divisia index) of the forecast against the recent fitted level.
 * For each bottom series: F - R = sum_k L(F, R) * dlog_k + other, with L(F, R) = (F - R) / (ln F - ln R).
 * dlog_k is the change of driver k's log component between the recent months and the forecast months,
 * including the scenario. "Other" holds the reconciliation adjustment and averaging effects.
 * Contributions are in units and add up exactly across the hierarchy. Sentences are returned as dictionary keys
 * plus computed parameters, so every number traces to a computed value.
 */
import type { Engine, ScenarioRun } from "./engine";
import { logEffects } from "./scenario";
import type { CompKey } from "./model";

export type DriverKey = "season" | "trend" | "leads" | "promo" | "market";
export const DRIVERS: DriverKey[] = ["season", "trend", "leads", "promo", "market"];

export interface Bridge {
  /** Recent fitted level, average units per month over the last 3 months. */
  base: number;
  contrib: Record<DriverKey, number>;
  other: number;
  /** Forecast, average units per month over the selected months. */
  forecast: number;
}

const logMean = (a: number, b: number) => (Math.abs(a - b) < 1e-9 ? a : (a - b) / (Math.log(a) - Math.log(b)));

export function bridge(engine: Engine, run: ScenarioRun, nodeId: string, months: number[]): Bridge {
  const n = engine.node(nodeId);
  const out: Bridge = { base: 0, contrib: { season: 0, trend: 0, leads: 0, promo: 0, market: 0 }, other: 0, forecast: 0 };
  for (const i of n.bottoms) {
    const se = engine.fc.series[i];
    const c = se.comps;
    const keys: CompKey[] = ["base", "season", "trend", "leads", "promo", "market"];
    let R = 0;
    for (let r = 0; r < 3; r++) R += Math.exp(keys.reduce((a, k) => a + c[k][r], 0));
    R /= 3;
    const F = months.reduce((a, h) => a + run.mean[i][h], 0) / months.length;
    if (R <= 0 || F <= 0) {
      out.base += R;
      out.forecast += F;
      out.other += F - R;
      continue;
    }
    const L = logMean(F, R);
    let explained = 0;
    for (const k of DRIVERS) {
      const recent = (c[k][0] + c[k][1] + c[k][2]) / 3;
      let fut = 0;
      for (const h of months) {
        const e = logEffects(engine.fc, engine.world, run.scenario, i, h);
        fut += c[k][3 + h] + (e[k] ?? 0);
      }
      fut /= months.length;
      const v = L * (fut - recent);
      out.contrib[k] += v;
      explained += v;
    }
    out.base += R;
    out.forecast += F;
    out.other += F - R - explained;
  }
  return out;
}

export interface Sentence {
  key: string;
  params: Record<string, number | string>;
}

export interface Summary {
  next3: number;
  last3: number;
  ly3: number;
  pctVsLast3: number;
  pctVsLy: number | null;
  top: DriverKey;
  second: DriverKey | null;
  bridge: Bridge;
  leadChange: number | null;
  sentences: Sentence[];
}

/** Change of the lead index of the node's dealership x brand pairs: last 2 months vs the 4 months before. */
export function leadChange(engine: Engine, nodeId: string): number | null {
  const n = engine.node(nodeId);
  const pairs = new Set(n.bottoms.map((i) => `${engine.fc.series[i].store}|${engine.brandOf[engine.fc.series[i].model]}`));
  const T = engine.tEnd;
  let recent = 0;
  let before = 0;
  for (const l of engine.history.leads) {
    if (!pairs.has(`${l.store}|${l.brand}`)) continue;
    const idx = (t: number) => l.web[t] + 4 * l.testDrives[t];
    recent += (idx(T) + idx(T - 1)) / 2;
    before += (idx(T - 2) + idx(T - 3) + idx(T - 4) + idx(T - 5)) / 4;
  }
  return before > 0 ? recent / before - 1 : null;
}

export function summarize(engine: Engine, run: ScenarioRun, nodeId: string): Summary {
  const hist = engine.actuals(nodeId);
  const T = engine.tEnd;
  const st = run.stats(nodeId);
  const next3 = st.mean[0] + st.mean[1] + st.mean[2];
  const last3 = hist[T] + hist[T - 1] + hist[T - 2];
  const ly3 = hist[T - 11] + hist[T - 10] + hist[T - 9];
  const b = bridge(engine, run, nodeId, [0, 1, 2]);
  const up = next3 >= last3;
  const ranked = DRIVERS.slice().sort((x, y) => (up ? b.contrib[y] - b.contrib[x] : b.contrib[x] - b.contrib[y]));
  const top = ranked[0];
  const second = ranked[1] && Math.sign(b.contrib[ranked[1]]) === Math.sign(b.contrib[top]) && Math.abs(b.contrib[ranked[1]]) > 0.25 * Math.abs(b.contrib[top]) ? ranked[1] : null;
  const lc = leadChange(engine, nodeId);
  const sentences: Sentence[] = [
    { key: up ? "explain.headline.up" : "explain.headline.down", params: { pct: Math.abs(next3 / Math.max(last3, 1e-9) - 1) } },
  ];
  const driverSentence = (k: DriverKey, lead: boolean): Sentence => {
    const v = b.contrib[k];
    const dir = v >= 0 ? "up" : "down";
    const params: Record<string, number | string> = { units: Math.abs(v * 3) };
    if (k === "leads" && lc !== null) params.pct = Math.abs(lc);
    const key = k === "leads" && lc !== null ? `explain.driver.leads.${dir}.withPct` : `explain.driver.${k}.${dir}`;
    return { key: lead ? `${key}.main` : `${key}.also`, params };
  };
  sentences.push(driverSentence(top, true));
  if (second) sentences.push(driverSentence(second, false));
  return {
    next3,
    last3,
    ly3,
    pctVsLast3: next3 / Math.max(last3, 1e-9) - 1,
    pctVsLy: ly3 > 0 ? next3 / ly3 - 1 : null,
    top,
    second,
    bridge: b,
    leadChange: lc,
    sentences,
  };
}

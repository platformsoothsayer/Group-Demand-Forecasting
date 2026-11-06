/** Shared selectors. Panorama and Pedido sugerido read the same functions, so their totals always agree. */
import type { OrderLine, OrderResult } from "./ordering";
import type { Engine, ScenarioRun } from "./engine";
import type { BacktestResult } from "./backtest";

export interface OrderSum {
  units: number;
  value: number;
  floorplanMonthly: number;
  lines: number;
}

export function orderSummary(lines: OrderLine[]): OrderSum {
  let units = 0;
  let value = 0;
  let fp = 0;
  let n = 0;
  for (const l of lines) {
    units += l.suggested;
    value += l.value;
    fp += l.floorplanMonthly;
    if (l.suggested > 0) n++;
  }
  return { units, value, floorplanMonthly: fp, lines: n };
}

export function approvedSummary(order: OrderResult, approved: Set<string>): OrderSum {
  return orderSummary(order.lines.filter((l) => approved.has(l.id)));
}

// ------------------------------------------------------------------ Panorama selectors

const NEXT3 = [0, 1, 2];

export interface Growth {
  next3: number;
  last3: number;
  ly3: number;
  /** Change vs the same months last year, null when the brand did not sell then. */
  yoy: number | null;
  /** Change vs the last 3 months. */
  seq: number;
}

export function growth(engine: Engine, run: ScenarioRun, nodeId: string): Growth {
  const hist = engine.actuals(nodeId);
  const T = engine.tEnd;
  const next3 = run.totalRange(nodeId, NEXT3).mean;
  const last3 = hist[T] + hist[T - 1] + hist[T - 2];
  const ly3 = hist[T - 11] + hist[T - 10] + hist[T - 9];
  const ly1 = Math.min(hist[T - 11], hist[T - 10], hist[T - 9]);
  return { next3, last3, ly3, yoy: ly1 > 0 ? next3 / ly3 - 1 : null, seq: next3 / Math.max(last3, 1e-9) - 1 };
}

export interface PanoramaKpis {
  units: { mean: number; q10: number; q90: number; seq: number; spark: number[]; split: number };
  yoy: { value: number; ly3: number; mature: number; spark: number[] };
  revenue: { value: number; ly: number; spark: number[]; split: number };
  accuracy: { value: number; vsMovingAverage: number; vsSeasonalNaive: number; spark: number[] };
  topBrand: { brand: string; seq: number; spark: number[]; split: number };
  riskModel: { model: string; yoy: number; lost: number; spark: number[]; split: number };
}

function monthly(engine: Engine, run: ScenarioRun, nodeId: string, histMonths = 12) {
  const hist = engine.actuals(nodeId);
  const T = engine.tEnd;
  const st = run.stats(nodeId);
  return { data: [...hist.slice(T - histMonths + 1), ...st.mean], split: histMonths - 1 };
}

export function panoramaKpis(engine: Engine, run: ScenarioRun, bt: BacktestResult): PanoramaKpis {
  const T = engine.tEnd;
  const r = run.totalRange("G", NEXT3);
  const g = monthly(engine, run, "G");
  const hist = engine.actuals("G");
  const ly3 = hist[T - 11] + hist[T - 10] + hist[T - 9];
  const matureBrands = engine.world.brands.filter((b) => b.launchT === null);
  const mNext = matureBrands.reduce((a, b) => a + run.totalRange(`B:${b.id}`, NEXT3).mean, 0);
  const mLy = matureBrands.reduce((a, b) => {
    const h = engine.actuals(`B:${b.id}`);
    return a + h[T - 11] + h[T - 10] + h[T - 9];
  }, 0);
  const yoySpark: number[] = [];
  for (let t = T - 8; t <= T; t++) yoySpark.push(hist[t] / hist[t - 12] - 1);
  const st = run.stats("G");
  for (let h = 0; h < 3; h++) yoySpark.push(st.mean[h] / hist[T + 1 + h - 12] - 1);
  // revenue: forecast at forecast mix prices, last year at the same prices
  let rev = 0;
  let revLy = 0;
  const revSpark: number[] = [];
  for (let tt = T - 11; tt <= T; tt++) {
    let v = 0;
    engine.fc.series.forEach((_, i) => (v += engine.historyOf(i)[tt] * engine.price[i][0]));
    revSpark.push(v);
  }
  for (let h = 0; h < engine.H; h++) {
    let v = 0;
    engine.fc.series.forEach((_, i) => {
      v += run.mean[i][h] * engine.price[i][h];
      if (h < 3) revLy += engine.historyOf(i)[T + 1 + h - 12] * engine.price[i][h];
    });
    if (h < 3) rev += v;
    revSpark.push(v);
  }
  const brands = engine.world.brands.map((b) => ({ b, gr: growth(engine, run, `B:${b.id}`) }));
  const top = brands.reduce((a, x) => (x.gr.seq > a.gr.seq ? x : a));
  const models = engine.world.models.filter((m) => m.segment !== "newEntrant").map((m) => ({ m, gr: growth(engine, run, `M:${m.id}`) }));
  // Most at risk: the model losing the most units vs last year (materiality over noisy small percentages).
  const lost = (x: (typeof models)[number]) => x.gr.next3 - x.gr.ly3;
  const risk = models.reduce((a, x) => (lost(x) < lost(a) ? x : a));
  const m = bt.metrics.storeModel;
  const tb = monthly(engine, run, `B:${top.b.id}`);
  const rm = monthly(engine, run, `M:${risk.m.id}`);
  return {
    units: { mean: r.mean, q10: r.q10, q90: r.q90, seq: r.mean / (hist[T] + hist[T - 1] + hist[T - 2]) - 1, spark: g.data, split: g.split },
    yoy: { value: r.mean / ly3 - 1, ly3, mature: mNext / mLy - 1, spark: yoySpark },
    revenue: { value: rev, ly: revLy, spark: revSpark, split: 11 },
    accuracy: { value: 1 - m.ai.wape, vsMovingAverage: m.movingAverage.wape - m.ai.wape, vsSeasonalNaive: m.seasonalNaive.wape - m.ai.wape, spark: bt.accuracyByOrigin },
    topBrand: { brand: top.b.id, seq: top.gr.seq, spark: tb.data, split: tb.split },
    riskModel: { model: risk.m.id, yoy: risk.gr.yoy ?? 0, lost: lost(risk), spark: rm.data, split: rm.split },
  };
}

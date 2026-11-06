/**
 * Suggested order, computed in the browser for every dealership x model x trim x color line.
 *   suggested = max(0, forecast demand over (lead time + review period) + safety stock - on hand - in transit),
 *   rounded to whole units.
 * Demand over the window comes from the reconciled sample paths (scenario applied). Safety stock is the
 * service-level quantile of the dealership x model window demand across the paths minus its mean (an empirical
 * quantile, no normal approximation), split to lines with the forecast trim and color shares (buyers accept a near
 * configuration, so service is set per dealership and model). Rounding uses largest remainders within each
 * dealership x model, so line orders are the floor or ceiling of the exact need and add up to its rounded total.
 */
import type { BrandClass, Inventory, World } from "./types";
import { daysIn } from "./calendar";
import type { Engine, ScenarioRun } from "./engine";

export type SeasonKey = "buenFin" | "december" | "january";

export interface OrderSettings {
  serviceLevel: number;
  leadDays: Record<string, number>;
  reviewDays: number;
  floorplanRate: number;
}

export const DEFAULT_LEAD_BY_CLASS: Record<BrandClass, number> = { volume: 45, premium: 60, luxury: 90, newEntrant: 120 };

export function defaultOrderSettings(world: World): OrderSettings {
  return {
    serviceLevel: 0.9,
    leadDays: Object.fromEntries(world.brands.map((b) => [b.id, DEFAULT_LEAD_BY_CLASS[b.cls]])),
    reviewDays: 30,
    floorplanRate: 0.12,
  };
}

export interface OrderLine {
  id: string;
  store: string;
  model: string;
  brand: string;
  trim: number;
  color: number;
  series: number;
  /** Forecast demand over lead time + review period. */
  demand: number;
  safety: number;
  /** Exact need before rounding: max(0, demand + safety - on hand - in transit). */
  need: number;
  onHand: number;
  inTransit: number;
  suggested: number;
  unitCost: number;
  value: number;
  /** Monthly plan piso interest on the order value. */
  floorplanMonthly: number;
  flags: SeasonKey[];
  storyId?: number;
}

export interface OrderResult {
  lines: OrderLine[];
  windowDays: Record<string, number>;
  arrival: Record<string, { from: number; to: number; flags: SeasonKey[] }>;
  computeMs: number;
}

/** Day offsets from AS_OF of the season windows. */
export function seasonWindows(world: World): Record<SeasonKey, [number, number]> {
  const base = Date.parse(`${world.asOf}T00:00:00Z`);
  const d = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - base) / 86400000);
  return Object.fromEntries(world.seasons.map((s) => [s.key, [d(s.from), d(s.to) + 1]])) as Record<SeasonKey, [number, number]>;
}

export function arrivalFlags(world: World, lead: number, review: number): SeasonKey[] {
  const w = seasonWindows(world);
  const out: SeasonKey[] = [];
  for (const k of ["buenFin", "december", "january"] as SeasonKey[]) {
    const [a, b] = w[k];
    const overlap = Math.min(b, lead + review) - Math.max(a, lead);
    if (overlap >= 1) out.push(k);
  }
  return out;
}

export function computeOrder(engine: Engine, run: ScenarioRun, inventory: Inventory, s: OrderSettings): OrderResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const { world, fc, H, nP } = engine;
  const monthStart: number[] = [];
  const monthLen: number[] = [];
  let acc = 0;
  for (let h = 0; h < H; h++) {
    monthStart.push(acc);
    monthLen.push(daysIn(fc.tEnd + 1 + h));
    acc += monthLen[h];
  }
  const brandById = Object.fromEntries(world.brands.map((b) => [b.id, b]));
  const modelById = Object.fromEntries(world.models.map((m) => [m.id, m]));
  const windowDays: Record<string, number> = {};
  const arrival: OrderResult["arrival"] = {};
  for (const b of world.brands) {
    const L = s.leadDays[b.id];
    windowDays[b.id] = L + s.reviewDays;
    arrival[b.id] = { from: L, to: L + s.reviewDays, flags: arrivalFlags(world, L, s.reviewDays) };
  }
  const seriesIdx = new Map(fc.series.map((x, i) => [`${x.store}|${x.model}`, i]));
  // per series: window demand by path and month weights
  const perSeries = fc.series.map((se, i) => {
    const W = windowDays[engine.brandOf[se.model]];
    const frac = monthStart.map((st, h) => Math.max(0, Math.min(1, (W - st) / monthLen[h])));
    const D = new Float64Array(nP);
    const p = run.paths[i];
    for (let h = 0; h < H; h++) {
      if (!frac[h]) continue;
      for (let j = 0; j < nP; j++) D[j] += frac[h] * p[h * nP + j];
    }
    const wMean = frac.map((f, h) => f * run.mean[i][h]);
    const ED = wMean.reduce((a, b) => a + b, 0);
    const sorted = Float64Array.from(D).sort();
    const q = sorted[Math.min(nP - 1, Math.max(0, Math.ceil(s.serviceLevel * nP) - 1))];
    return { D, wMean, ED, quantile: q, safety: Math.max(0, q - ED) };
  });
  const lines: OrderLine[] = inventory.lines.map((ln) => {
    const i = seriesIdx.get(`${ln.store}|${ln.model}`)!;
    const se = fc.series[i];
    const ps = perSeries[i];
    let share = 0;
    if (ps.ED > 0) {
      for (let h = 0; h < H; h++) share += ps.wMean[h] * se.trim[h][ln.trim] * se.color[h][ln.color];
      share /= ps.ED;
    }
    const demand = share * ps.ED;
    const safety = share * ps.safety;
    const need = Math.max(0, demand + safety - ln.onHand - ln.inTransit);
    const m = modelById[ln.model];
    const b = brandById[m.brand];
    const unitCost = Math.round(m.msrpBase * world.trimSteps[ln.trim] * b.costRatio);
    return {
      id: `${ln.store}|${ln.model}|${ln.trim}|${ln.color}`,
      store: ln.store,
      model: ln.model,
      brand: m.brand,
      trim: ln.trim,
      color: ln.color,
      series: i,
      demand,
      safety,
      need,
      onHand: ln.onHand,
      inTransit: ln.inTransit,
      suggested: 0,
      unitCost,
      value: 0,
      floorplanMonthly: 0,
      flags: arrival[m.brand].flags,
      ...(ln.storyId ? { storyId: ln.storyId } : {}),
    };
  });
  // largest-remainder rounding within each dealership x model
  const bySeries = new Map<number, OrderLine[]>();
  for (const l of lines) (bySeries.get(l.series) ?? bySeries.set(l.series, []).get(l.series)!).push(l);
  for (const group of bySeries.values()) {
    const total = Math.round(group.reduce((a, l) => a + l.need, 0));
    let assigned = 0;
    for (const l of group) {
      l.suggested = Math.floor(l.need);
      assigned += l.suggested;
    }
    const rest = group.filter((l) => l.need > l.suggested).sort((a, b) => b.need - b.suggested - (a.need - a.suggested) || a.id.localeCompare(b.id));
    for (let k = 0; k < total - assigned && k < rest.length; k++) rest[k].suggested += 1;
    for (const l of group) {
      l.value = l.suggested * l.unitCost;
      l.floorplanMonthly = (l.value * s.floorplanRate) / 12;
    }
  }
  return { lines, windowDays, arrival, computeMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0 };
}

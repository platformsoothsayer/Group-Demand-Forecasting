/**
 * Scenarios, applied in the browser. Each control moves a fitted driver; the effect on every bottom series is
 * exp(coefficient x change), using that series' fitted elasticities (segment level for new models).
 * Factors multiply the reconciled sample paths of the bottom level, and every level is summed from there,
 * so the hierarchy stays coherent. A neutral scenario gives factors of exactly 1.
 */
import type { World } from "./types";
import type { ForecastFile } from "./forecastFile";
import type { CompKey } from "./model";

export interface Campaign {
  brand: string | null;
  /** Depth in percent of MSRP. */
  depth: number;
  /** First forecast month (0 = first month after AS_OF). */
  start: number;
  months: number;
}

export interface Scenario {
  /** Change in credit rate, percentage points. */
  credit: number;
  /** Change in fuel price, percent. */
  fuel: number;
  /** Change in consumer confidence, index points. */
  confidence: number;
  /** Change in web leads and test drives, percent. */
  leads: number;
  campaign: Campaign;
}

export const NEUTRAL: Scenario = { credit: 0, fuel: 0, confidence: 0, leads: 0, campaign: { brand: null, depth: 0, start: 0, months: 2 } };

export const LIMITS = {
  credit: { min: -3, max: 3, step: 0.25 },
  fuel: { min: -20, max: 20, step: 1 },
  confidence: { min: -10, max: 10, step: 1 },
  leads: { min: -30, max: 30, step: 1 },
  depth: { min: 0, max: 10, step: 0.5 },
} as const;

export function isNeutral(s: Scenario): boolean {
  return s.credit === 0 && s.fuel === 0 && s.confidence === 0 && s.leads === 0 && (s.campaign.brand === null || s.campaign.depth === 0);
}

export function scenarioKey(s: Scenario): string {
  if (isNeutral(s)) return "base";
  const c = s.campaign.brand && s.campaign.depth ? `${s.campaign.brand}:${s.campaign.depth}:${s.campaign.start}:${s.campaign.months}` : "-";
  return `${s.credit}|${s.fuel}|${s.confidence}|${s.leads}|${c}`;
}

/** Log effect of the scenario on each driver group, for series i and forecast month h. */
export function logEffects(fc: ForecastFile, world: World, s: Scenario, i: number, h: number): Partial<Record<CompKey, number>> {
  const se = fc.series[i];
  const t = fc.tEnd + 1 + h;
  const fuelBase = world.indicators.fuel[t];
  const market =
    se.coef.credit * world.finShare[se.seg] * s.credit + (se.coef.fuel * (fuelBase * s.fuel)) / 100 / 10 + (se.coef.conf * s.confidence) / 5;
  // The first forecast month uses leads already observed (one month lag), so a change in leads starts in month 2.
  const leads = h >= 1 && s.leads !== 0 ? se.coef.leads * Math.log(1 + s.leads / 100) : 0;
  const brand = world.models.find((m) => m.id === se.model)!.brand;
  const c = s.campaign;
  const promo = c.brand === brand && c.depth > 0 && h >= c.start && h < c.start + c.months ? (se.coef.promo * c.depth) / 100 : 0;
  return { market, leads, promo };
}

/** Multiplicative factor by bottom series and forecast month. Exactly 1 for the neutral scenario. */
export function scenarioFactors(fc: ForecastFile, world: World, s: Scenario): number[][] {
  const neutral = isNeutral(s);
  return fc.series.map((_, i) =>
    Array.from({ length: fc.horizon }, (_, h) => {
      if (neutral) return 1;
      const e = logEffects(fc, world, s, i, h);
      return Math.exp((e.market ?? 0) + (e.leads ?? 0) + (e.promo ?? 0));
    }),
  );
}

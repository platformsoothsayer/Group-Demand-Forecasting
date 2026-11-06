/** Shape of src/data/forecast.json, written by scripts/fit-models.ts. */
import type { Segment } from "./types";
import type { CompKey } from "./model";

export interface ScenarioCoef {
  /** Per point of credit rate, before the financing share. */
  credit: number;
  /** Per 10 index points of fuel price. */
  fuel: number;
  /** Per 5 index points of consumer confidence. */
  conf: number;
  /** Per unit of log lead index. */
  leads: number;
  /** Per unit of campaign depth (0..1). */
  promo: number;
}

export interface SeriesForecast {
  store: string;
  model: string;
  seg: Segment;
  cold: boolean;
  /** Base sample paths, integer units [h][path]. */
  paths: number[][];
  /** OLS reconciliation shift [h]. Reconciled path = max(0, path + delta). */
  delta: number[];
  coef: ScenarioCoef;
  /** Log components for months tEnd-2 .. tEnd+H. */
  comps: Record<CompKey, number[]>;
  trim: number[][];
  color: number[][];
}

export interface ColdInfo {
  series: number;
  launchT: number;
  weights: number[];
  priorWeights: number[];
  M: number[];
  prior: number[];
  leadShare: number;
}

export interface AnalogInfo {
  id: string;
  brand: string;
  model: string;
  launchYear: number;
  launchMonth: number;
  tau: number;
  M: number;
  sigma: number;
  actualNorm: number[];
  curve: number[];
}

export interface SegmentSummary {
  seg: string;
  k: number;
  nSeries: number;
  credit: number;
  fuel: number;
  confidence: number;
  leads: number;
  promo: number;
  season: number[];
}

export interface ForecastFile {
  tEnd: number;
  horizon: number;
  nPaths: number;
  series: SeriesForecast[];
  base: Record<string, number[]>;
  cold: ColdInfo[];
  analogs: AnalogInfo[];
  segments: SegmentSummary[];
  /** Baseline path of the lead index (store|brand) for months tEnd+1 .. tEnd+H-1. */
  leadPath: Record<string, number[]>;
}

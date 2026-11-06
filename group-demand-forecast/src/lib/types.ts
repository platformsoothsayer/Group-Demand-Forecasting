/** Brand class drives lead time and display. Segment drives model pooling. */
export type BrandClass = "volume" | "premium" | "luxury" | "newEntrant";
export type Segment = "volume" | "pickup" | "premium" | "luxury" | "newEntrant";
export type Tier = "premiumUrban" | "urbanMid" | "suburban" | "suburbanValue" | "regional" | "regionalGrowth" | "regionalValue";
export type Level = "group" | "brand" | "model" | "storeBrand" | "storeModel" | "store";

export interface Store {
  id: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  tier: Tier;
  brands: string[];
}

export interface Brand {
  id: string;
  name: string;
  cls: BrandClass;
  costRatio: number;
  /** Month index of launch in the group, null if sold for the whole history. */
  launchT: number | null;
  imported: boolean;
}

export interface Model {
  id: string;
  brand: string;
  name: string;
  body: string;
  segment: Segment;
  msrpBase: number;
}

export interface AnalogLaunch {
  id: string;
  brand: string;
  model: string;
  launchYear: number;
  launchMonth: number; // 0-based calendar month
  segment: Segment;
  /** Group monthly sales for the first 30 months after launch. */
  sales: number[];
}

export interface Story {
  id: number;
  key: string;
  brand?: string;
  model?: string;
  stores?: string[];
}

export interface World {
  seed: number;
  asOf: string;
  start: { year: number; month: number };
  hist: number;
  horizon: number;
  stores: Store[];
  brands: Brand[];
  models: Model[];
  trims: string[];
  trimSteps: number[];
  colors: string[];
  /** Share of units bought with financing by segment (from F&I records). */
  finShare: Record<Segment, number>;
  /** Market indicators, sample series. Index 0..hist-1 history, hist..hist+horizon-1 baseline path. */
  indicators: { credit: number[]; fuel: number[]; confidence: number[] };
  ref: { credit: number; fuel: number; confidence: number };
  /** Campaign depth by brand (0..1), history plus planned calendar. */
  promo: Record<string, number[]>;
  /** Season windows used for order flags (day offsets from AS_OF). */
  seasons: { key: "buenFin" | "december" | "january"; from: string; to: string }[];
  analogs: AnalogLaunch[];
  stories: Story[];
}

export interface SeriesHistory {
  store: string;
  model: string;
  /** First month index with sales (franchise or model launch). */
  startT: number;
  sales: number[];
  trim: number[][]; // [t][3]
  color: number[][]; // [t][6]
}

export interface LeadsHistory {
  store: string;
  brand: string;
  web: number[];
  testDrives: number[];
  storyId?: number;
}

export interface History {
  series: SeriesHistory[];
  leads: LeadsHistory[];
}

export interface InventoryLine {
  store: string;
  model: string;
  trim: number;
  color: number;
  onHand: number;
  inTransit: number;
  storyId?: number;
}

export interface Inventory {
  lines: InventoryLine[];
  /** Average monthly units ordered over the last 3 months, by store and model. */
  recentOrders: Record<string, Record<string, number>>;
  source: string;
}

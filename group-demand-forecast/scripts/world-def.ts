/**
 * World definition shared with the companion demo (group-inventory-optimizer):
 * dealerships, brands, models, prices, trims, colors, traffic, affinity and mix preferences.
 * Truth parameters below the divider are used only by the generator. The model never sees them.
 */
import type { Brand, Model, Segment, Store, Tier } from "../src/lib/types";

export const STORES: Store[] = [
  { id: "POL", name: "Polanco", region: "CDMX", lat: 19.433, lng: -99.195, tier: "premiumUrban", brands: ["SOL", "NOR", "KAI"] },
  { id: "SFE", name: "Santa Fe", region: "CDMX", lat: 19.359, lng: -99.259, tier: "premiumUrban", brands: ["NOR", "VAN", "SOL"] },
  { id: "COY", name: "Coyoacán", region: "CDMX", lat: 19.35, lng: -99.162, tier: "urbanMid", brands: ["KAI", "ZHE", "QIY"] },
  { id: "SAT", name: "Satélite", region: "Edomex", lat: 19.509, lng: -99.234, tier: "suburban", brands: ["KAI", "VAN", "ZHE"] },
  { id: "ECA", name: "Ecatepec", region: "Edomex", lat: 19.601, lng: -99.05, tier: "suburbanValue", brands: ["KAI", "ZHE"] },
  { id: "TOL", name: "Toluca", region: "Edomex", lat: 19.282, lng: -99.656, tier: "regional", brands: ["VAN", "KAI", "NOR"] },
  { id: "PUE", name: "Puebla", region: "Puebla", lat: 19.041, lng: -98.206, tier: "regional", brands: ["KAI", "VAN", "ZHE", "QIY"] },
  { id: "QRO", name: "Querétaro", region: "Querétaro", lat: 20.588, lng: -100.389, tier: "regionalGrowth", brands: ["NOR", "VAN", "QIY", "SOL"] },
  { id: "PAC", name: "Pachuca", region: "Hidalgo", lat: 20.101, lng: -98.759, tier: "regionalValue", brands: ["ZHE", "KAI"] },
  { id: "LEO", name: "León", region: "Guanajuato", lat: 21.122, lng: -101.682, tier: "regional", brands: ["VAN", "QIY", "KAI"] },
];

/** Zhenlong launched February 2026 (t = 27), Qiyun May 2026 (t = 30). Same dates as the companion demo. */
export const BRANDS: Brand[] = [
  { id: "KAI", name: "Kaido", cls: "volume", costRatio: 0.9, launchT: null, imported: false },
  { id: "VAN", name: "Vantor", cls: "volume", costRatio: 0.88, launchT: null, imported: false },
  { id: "NOR", name: "Nordhaus", cls: "premium", costRatio: 0.89, launchT: null, imported: true },
  { id: "SOL", name: "Solenne", cls: "luxury", costRatio: 0.88, launchT: null, imported: true },
  { id: "ZHE", name: "Zhenlong", cls: "newEntrant", costRatio: 0.91, launchT: 27, imported: true },
  { id: "QIY", name: "Qiyun", cls: "newEntrant", costRatio: 0.92, launchT: 30, imported: true },
];

export const MODELS: Model[] = [
  { id: "K3", brand: "KAI", name: "K3", body: "sedan", segment: "volume", msrpBase: 382000 },
  { id: "KX3", brand: "KAI", name: "KX3", body: "compactSuv", segment: "volume", msrpBase: 458000 },
  { id: "KX5", brand: "KAI", name: "KX5", body: "midSuv", segment: "volume", msrpBase: 612000 },
  { id: "TERRA", brand: "VAN", name: "Terra", body: "pickup", segment: "pickup", msrpBase: 662000 },
  { id: "ATLAS", brand: "VAN", name: "Atlas", body: "midSuv", segment: "volume", msrpBase: 638000 },
  { id: "SUMMIT", brand: "VAN", name: "Summit", body: "largeSuv", segment: "volume", msrpBase: 704000 },
  { id: "N3", brand: "NOR", name: "N3", body: "premiumCompactSuv", segment: "premium", msrpBase: 1024000 },
  { id: "N5", brand: "NOR", name: "N5", body: "premiumMidSuv", segment: "premium", msrpBase: 1288000 },
  { id: "BERLINA", brand: "SOL", name: "Berlina", body: "luxurySedan", segment: "luxury", msrpBase: 1846000 },
  { id: "GRAND", brand: "SOL", name: "Grand", body: "luxurySuv", segment: "luxury", msrpBase: 2148000 },
  { id: "Z5", brand: "ZHE", name: "Z5", body: "compactSuv", segment: "newEntrant", msrpBase: 424000 },
  { id: "Z7", brand: "ZHE", name: "Z7", body: "midSuv", segment: "newEntrant", msrpBase: 528000 },
  { id: "QHYB", brand: "QIY", name: "Q Hybrid", body: "hybridSuv", segment: "newEntrant", msrpBase: 556000 },
  { id: "QE", brand: "QIY", name: "Q e", body: "compactEv", segment: "newEntrant", msrpBase: 612000 },
];

export const TRIMS = ["base", "mid", "top"];
export const TRIM_STEPS = [1.0, 1.09, 1.2];
export const COLORS = ["white", "silver", "gray", "black", "red", "blue"];

/** Share of units bought with financing (F&I records). Known input, not fitted. */
export const FIN_SHARE: Record<Segment, number> = { volume: 0.78, pickup: 0.72, premium: 0.42, luxury: 0.1, newEntrant: 0.85 };

/** Coyoacán adds the Zhenlong franchise late (July 2026), as in the companion demo. */
export const LATE_FRANCHISE: Record<string, Record<string, number>> = { COY: { ZHE: 32 } };

// ---------------------------------------------------------------- truth (generator only)

export const BASE_RATE: Record<string, number> = {
  K3: 9, KX3: 11, KX5: 8, TERRA: 7, ATLAS: 6, SUMMIT: 3.6, N3: 4.2, N5: 3.2, BERLINA: 1.5, GRAND: 0.8, Z5: 8, Z7: 6, QHYB: 6, QE: 3.5,
};
export const RATE_SCALE = 2.0;
export const TRAFFIC: Record<string, number> = { POL: 1.15, SFE: 1.1, COY: 1.0, SAT: 1.05, ECA: 0.95, TOL: 0.85, PUE: 1.0, QRO: 1.0, PAC: 0.75, LEO: 0.9 };
export const MODEL_BOOST: Record<string, Record<string, number>> = { LEO: { SUMMIT: 1.1 } };
export const AFFINITY: Record<string, Record<string, number>> = {
  POL: { SOL: 1.15, NOR: 1.2, KAI: 0.5 },
  SFE: { NOR: 0.95, VAN: 0.9, SOL: 1.25 },
  COY: { KAI: 1.0, ZHE: 0.9, QIY: 1.3 },
  SAT: { KAI: 1.2, VAN: 0.9, ZHE: 1.0 },
  ECA: { KAI: 1.15, ZHE: 1.3 },
  TOL: { VAN: 1.1, KAI: 1.0, NOR: 1.3 },
  PUE: { KAI: 1.05, VAN: 1.0, ZHE: 1.1, QIY: 0.9 },
  QRO: { NOR: 1.1, VAN: 0.95, QIY: 1.15, SOL: 0.6 },
  PAC: { ZHE: 1.15, KAI: 1.05 },
  LEO: { VAN: 0.85, QIY: 1.0, KAI: 1.0 },
};
export const TRIM_PREF: Record<Tier, number[]> = {
  premiumUrban: [0.15, 0.38, 0.47],
  urbanMid: [0.3, 0.42, 0.28],
  suburban: [0.32, 0.43, 0.25],
  suburbanValue: [0.56, 0.31, 0.13],
  regional: [0.38, 0.38, 0.24],
  regionalGrowth: [0.34, 0.4, 0.26],
  regionalValue: [0.58, 0.3, 0.12],
};
export const COLOR_PREF: Record<Tier, number[]> = {
  premiumUrban: [0.1, 0.13, 0.22, 0.29, 0.08, 0.18],
  urbanMid: [0.2, 0.18, 0.2, 0.22, 0.11, 0.09],
  suburban: [0.24, 0.27, 0.17, 0.16, 0.09, 0.07],
  suburbanValue: [0.39, 0.25, 0.12, 0.1, 0.09, 0.05],
  regional: [0.29, 0.22, 0.17, 0.19, 0.08, 0.05],
  regionalGrowth: [0.25, 0.21, 0.19, 0.21, 0.07, 0.07],
  regionalValue: [0.41, 0.26, 0.1, 0.08, 0.1, 0.05],
};
/** Volume seasonality Jan..Dec: soft January, mid-year dip, Buen Fin lift in November, December peak. */
export const SEASON_VOLUME = [0.8, 0.9, 1.0, 0.97, 1.0, 0.92, 0.9, 0.95, 0.98, 1.02, 1.17, 1.39];
export const SEASON_DAMP: Record<Segment, number> = { volume: 1, pickup: 1, newEntrant: 1, premium: 0.45, luxury: 0.35 };

/** Truth: annual log trend by model. K3 accelerates its decline in the last 18 months. */
export const TREND: Record<string, number> = { K3: -0.22, KX3: 0.04, KX5: 0.05, TERRA: 0, ATLAS: 0.03, SUMMIT: 0.02, N3: 0.03, N5: 0, BERLINA: -0.02, GRAND: 0.02 };
export const K3_LATE_SLOPE = -0.22;

/** Truth driver coefficients. Credit enters as beta x financing share x (rate - ref). */
export const TRUE_CREDIT = -0.085;
export const TRUE_FUEL: Record<string, number> = { volume: -0.04, pickup: -0.16, premium: -0.02, luxury: 0, ZHE: -0.04, QIY: 0.05 };
export const TRUE_CONF: Record<Segment, number> = { volume: 0.06, pickup: 0.06, premium: 0.04, luxury: 0.03, newEntrant: 0.06 };
export const TRUE_LEADS = 0.55;
export const TRUE_PROMO = 3.0;
export const TRUE_K: Record<Segment, number> = { volume: 30, pickup: 30, premium: 40, luxury: 80, newEntrant: 25 };
/** Truth lifecycle speed (months) for new brands. Launch-phase level drift (log sd per month). */
export const TRUE_TAU: Record<string, number> = { ZHE: 5.5, QIY: 4.5 };
export const LAUNCH_DRIFT = 0.08;

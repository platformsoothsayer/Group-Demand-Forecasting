/**
 * Seeded synthetic world. Writes src/data/world.json, history.json, inventory.json.
 * Pure function of the seed. Planted stories are shaped here and must be found by the model.
 */
import fs from "node:fs";
import path from "node:path";
import { Rng } from "../src/lib/rng";
import { calOf } from "../src/lib/calendar";
import { leadIndex } from "../src/lib/drivers";
import { AS_OF, HIST, HORIZON, SEED, START } from "../src/config";
import type { AnalogLaunch, History, Inventory, InventoryLine, LeadsHistory, SeriesHistory, World } from "../src/lib/types";
import * as W from "./world-def";
import onhand from "./companion-onhand.json";

const T = HIST + HORIZON;
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r2 = (x: number) => Math.round(x * 100) / 100;
const normalize = (v: number[]) => {
  const s = v.reduce((a, b) => a + b, 0);
  return v.map((x) => x / s);
};

export function generate(seed: number) {
  const rng = new Rng(seed);
  const brandById = Object.fromEntries(W.BRANDS.map((b) => [b.id, b]));
  const modelById = Object.fromEntries(W.MODELS.map((m) => [m.id, m]));

  // ------------------------------------------------ market indicators (sample series)
  const credit: number[] = [];
  const fuel: number[] = [];
  const conf: number[] = [];
  let ec = 0, ef = 0, eq = 0;
  for (let t = 0; t < HIST; t++) {
    ec = 0.5 * ec + 0.07 * rng.normal();
    ef = 0.5 * ef + 0.9 * rng.normal();
    eq = 0.5 * eq + 0.35 * rng.normal();
    credit.push(14.5 + 1.25 * Math.sin((2 * Math.PI * (t - 6)) / 40) + 0.3 * Math.sin((2 * Math.PI * t) / 9) + ec);
    fuel.push(100 + 0.22 * (t - 18) + 5.5 * Math.sin((2 * Math.PI * (t + 3)) / 22) + ef);
    conf.push(46 + 2.4 * Math.sin((2 * Math.PI * (t - 10)) / 32) + eq);
  }
  // Baseline path for the forecast months: gentle easing of credit, slow fuel drift, flat confidence.
  for (let h = 1; h <= HORIZON; h++) {
    credit.push(credit[HIST - 1] - 0.03 * h);
    fuel.push(fuel[HIST - 1] + 0.2 * h);
    conf.push(conf[HIST - 1]);
  }
  const ref = { credit: 14.5, fuel: 100, confidence: 46 };

  // ------------------------------------------------ campaigns calendar (depth), history plus plan
  const promo: Record<string, number[]> = {};
  const fixed: Record<string, [number, number][]> = {
    // [month index, depth]
    KAI: [[0, 0.05], [7, 0.04], [24, 0.05], [29, 0.04], [36, 0.05]],
    VAN: [[1, 0.04], [10, 0.05], [19, 0.03], [25, 0.04], [37, 0.04]],
    NOR: [[5, 0.03], [17, 0.04], [31, 0.03], [40, 0.03]],
    SOL: [[14, 0.02]],
    ZHE: [[27, 0.06], [28, 0.05], [33, 0.04], [36, 0.06], [37, 0.06]],
    QIY: [[30, 0.05], [38, 0.04]],
  };
  for (const b of W.BRANDS) {
    const arr = new Array(T).fill(0);
    for (const [t, d] of fixed[b.id]) arr[t] = d;
    // a few random short campaigns in history
    for (let i = 0; i < 3; i++) {
      const t = 2 + Math.floor(rng.uniform() * 30);
      if (b.launchT !== null && t < b.launchT) continue;
      if (arr[t] === 0 && calOf(t) !== 10 && calOf(t) !== 11) arr[t] = r2(0.02 + 0.03 * rng.uniform());
    }
    promo[b.id] = arr.map(r4);
  }

  // ------------------------------------------------ series start (franchise or launch)
  const startT = (s: string, b: string) => W.LATE_FRANCHISE[s]?.[b] ?? brandById[b].launchT ?? 0;

  // ------------------------------------------------ store-level truth noise
  const trimPref: Record<string, number[]> = {};
  const colorPref: Record<string, number[]> = {};
  const modelNoise: Record<string, Record<string, number>> = {};
  for (const s of W.STORES) {
    trimPref[s.id] = normalize(W.TRIM_PREF[s.tier].map((x) => x * Math.exp(0.06 * rng.normal())));
    colorPref[s.id] = normalize(W.COLOR_PREF[s.tier].map((x) => x * Math.exp(0.06 * rng.normal())));
    modelNoise[s.id] = {};
    for (const m of W.MODELS) modelNoise[s.id][m.id] = Math.exp(0.08 * rng.normal());
  }
  const matureRate = (s: string, m: string) => {
    const mod = modelById[m];
    return W.BASE_RATE[m] * W.RATE_SCALE * W.TRAFFIC[s] * W.AFFINITY[s][mod.brand] * modelNoise[s][m] * (W.MODEL_BOOST[s]?.[m] ?? 1);
  };

  // ------------------------------------------------ leads and test drives by store x brand
  const leads: LeadsHistory[] = [];
  const leadRatio: Record<string, number[]> = {}; // truth: index / reference
  for (const s of W.STORES) {
    for (const b of s.brands) {
      const st = startT(s.id, b);
      const level = 6 * W.MODELS.filter((m) => m.brand === b).reduce((a, m) => a + matureRate(s.id, m.id), 0);
      const web: number[] = [];
      const td: number[] = [];
      const ratio: number[] = [];
      let e = 0;
      const story3 = b === "QIY" && (s.id === "QRO" || s.id === "PUE");
      for (let t = 0; t < HIST; t++) {
        e = 0.5 * e + 0.12 * rng.normal();
        if (t < st) {
          web.push(0);
          td.push(0);
          ratio.push(1);
          continue;
        }
        let mult = Math.exp(e);
        if (b === "ZHE") mult *= Math.exp(0.025 * (t - st)); // awareness builds after launch
        if (story3 && t === HIST - 2) mult *= 1.4;
        if (story3 && t === HIST - 1) mult *= 2.4;
        const wv = Math.max(1, Math.round(level * mult * Math.exp(0.05 * rng.normal())));
        const tv = Math.max(0, Math.round(0.2 * level * mult * Math.exp(0.08 * rng.normal())));
        web.push(wv);
        td.push(tv);
        ratio.push(leadIndex(wv, tv) / (1.8 * level));
      }
      leads.push({ store: s.id, brand: b, web, testDrives: td, ...(story3 ? { storyId: 3 } : {}) });
      leadRatio[`${s.id}|${b}`] = ratio;
    }
  }

  // ------------------------------------------------ launch-phase level drift by model (new brands)
  const drift: Record<string, number[]> = {};
  for (const m of W.MODELS) {
    const b = brandById[m.brand];
    const arr = new Array(HIST).fill(0);
    if (b.launchT !== null) {
      let x = 0;
      for (let t = b.launchT; t < HIST; t++) {
        x += W.LAUNCH_DRIFT * rng.normal();
        arr[t] = x;
      }
    }
    drift[m.id] = arr;
  }

  const season = (seg: string, cal: number) => 1 + (W.SEASON_DAMP[seg as keyof typeof W.SEASON_DAMP] ?? 1) * (W.SEASON_VOLUME[cal] - 1);
  const trendLog = (m: string, t: number) => {
    if (m === "K3" && W.K3_LATE_SLOPE !== W.TREND.K3) {
      const knee = 18;
      const now = HIST - 1;
      // continuous piecewise, 0 at t = now
      const late = (W.K3_LATE_SLOPE * (Math.max(t, knee) - now)) / 12;
      const early = (W.TREND.K3 * (Math.min(t, knee) - knee)) / 12;
      return late + early;
    }
    return ((W.TREND[m] ?? 0) * (t - (HIST - 1))) / 12;
  };

  // ------------------------------------------------ sales, trim and color by month
  const series: SeriesHistory[] = [];
  const truthMu: Record<string, number[]> = {};
  for (const s of W.STORES) {
    for (const m of W.MODELS) {
      if (!s.brands.includes(m.brand)) continue;
      const b = brandById[m.brand];
      const st = startT(s.id, m.brand);
      const sales: number[] = [];
      const trim: number[][] = [];
      const color: number[][] = [];
      const mus: number[] = [];
      for (let t = 0; t < HIST; t++) {
        if (t < st) {
          sales.push(0);
          trim.push([0, 0, 0]);
          color.push([0, 0, 0, 0, 0, 0]);
          mus.push(0);
          continue;
        }
        const cal = calOf(t);
        const seg = m.segment;
        let mu = matureRate(s.id, m.id) * season(seg, cal);
        if (b.launchT !== null) {
          const a = t - b.launchT;
          mu *= (1 - Math.exp(-(a + 1) / W.TRUE_TAU[b.id])) * Math.exp(drift[m.id][t]);
        } else {
          mu *= Math.exp(trendLog(m.id, t));
        }
        const fuelCoef = seg === "newEntrant" ? W.TRUE_FUEL[b.id] : W.TRUE_FUEL[seg];
        const lr = t > 0 ? leadRatio[`${s.id}|${m.brand}`][t - 1] : 1;
        const lx = t - 1 >= st ? Math.log(lr) : 0;
        mu *= Math.exp(
          W.TRUE_CREDIT * W.FIN_SHARE[seg] * (credit[t] - ref.credit) +
            (fuelCoef * (fuel[t] - ref.fuel)) / 10 +
            (W.TRUE_CONF[seg] * (conf[t] - ref.confidence)) / 5 +
            W.TRUE_LEADS * lx +
            W.TRUE_PROMO * promo[m.brand][t],
        );
        mus.push(mu);
        const y = rng.negbin(mu, W.TRUE_K[seg]);
        sales.push(y);
        // trim mix: Satélite shifts toward the top trim over the last 12 months
        let tp = trimPref[s.id];
        if (s.id === "SAT" && t > 23) tp = normalize([tp[0], tp[1], tp[2] * Math.exp(0.05 * (t - 23))]);
        trim.push(rng.multinomial(y, tp));
        color.push(rng.multinomial(y, colorPref[s.id]));
      }
      series.push({ store: s.id, model: m.id, startT: st, sales, trim, color });
      truthMu[`${s.id}|${m.id}`] = mus;
    }
  }

  // ------------------------------------------------ analog launches archive (earlier launches, group level)
  const analogDefs = [
    { id: "KX3-2019", brand: "KAI", model: "KX3", launchYear: 2019, launchMonth: 2, segment: "volume" as const, M: 210, tau: 4.2 },
    { id: "ATLAS-2020", brand: "VAN", model: "ATLAS", launchYear: 2020, launchMonth: 7, segment: "volume" as const, M: 95, tau: 5.6 },
    { id: "N3-2021", brand: "NOR", model: "N3", launchYear: 2021, launchMonth: 1, segment: "premium" as const, M: 62, tau: 4.8 },
  ];
  const analogs: AnalogLaunch[] = analogDefs.map((d) => {
    let x = 0;
    const sales: number[] = [];
    for (let a = 0; a < 30; a++) {
      x += a < 18 ? W.LAUNCH_DRIFT * rng.normal() : 0.02 * rng.normal();
      const cal = (d.launchMonth + a) % 12;
      const mu = d.M * (1 - Math.exp(-(a + 1) / d.tau)) * season(d.segment, cal) * Math.exp(x);
      sales.push(rng.negbin(mu, 30));
    }
    return { id: d.id, brand: d.brand, model: d.model, launchYear: d.launchYear, launchMonth: d.launchMonth, segment: d.segment, sales };
  });

  // ------------------------------------------------ inventory: on hand from the companion snapshot, in transit from the habit rule
  const leadDays: Record<string, number> = { volume: 45, premium: 60, luxury: 90, newEntrant: 120 };
  const recentOrders: Record<string, Record<string, number>> = {};
  const lines: InventoryLine[] = [];
  const oh = new Map<string, number>();
  for (const [s, m, tr, c, n] of onhand.lines as [string, string, number, number, number][]) oh.set(`${s}|${m}|${tr}|${c}`, n);
  for (const sh of series) {
    const m = modelById[sh.model];
    const b = brandById[m.brand];
    // Habit rule: order what sold in the same months last year. New models: recent run rate plus 10 percent.
    const ly = [HIST - 13, HIST - 12, HIST - 11].map((t) => sh.sales[t]);
    const recent = sh.sales.slice(HIST - 3);
    const hasLy = sh.startT <= HIST - 13;
    const rate = hasLy ? ly.reduce((a, x) => a + x, 0) / 3 : (1.1 * recent.reduce((a, x) => a + x, 0)) / 3;
    (recentOrders[sh.store] ??= {})[sh.model] = r2(rate);
    // historical mix over all months (the habit ignores mix trends)
    const tTot = [0, 0, 0];
    const cTot = [0, 0, 0, 0, 0, 0];
    sh.trim.forEach((v) => v.forEach((x, i) => (tTot[i] += x)));
    sh.color.forEach((v) => v.forEach((x, i) => (cTot[i] += x)));
    const tp = normalize(tTot.map((x) => x + 0.5));
    const cp = normalize(cTot.map((x) => x + 0.5));
    const pipeline = Math.round(rate * (leadDays[b.cls] / 30) * (0.85 + 0.2 * rng.uniform()));
    const cells = rng.multinomial(pipeline, tp.flatMap((p) => cp.map((q) => p * q)));
    for (let tr = 0; tr < 3; tr++) {
      for (let c = 0; c < 6; c++) {
        const story = sh.model === "K3" ? 6 : sh.store === "SAT" ? 5 : undefined;
        lines.push({
          store: sh.store,
          model: sh.model,
          trim: tr,
          color: c,
          onHand: oh.get(`${sh.store}|${sh.model}|${tr}|${c}`) ?? 0,
          inTransit: cells[tr * 6 + c],
          ...(story ? { storyId: story } : {}),
        });
      }
    }
  }

  const world: World = {
    seed,
    asOf: AS_OF,
    start: START,
    hist: HIST,
    horizon: HORIZON,
    stores: W.STORES,
    brands: W.BRANDS,
    models: W.MODELS,
    trims: W.TRIMS,
    trimSteps: W.TRIM_STEPS,
    colors: W.COLORS,
    finShare: W.FIN_SHARE,
    indicators: { credit: credit.map(r4), fuel: fuel.map(r4), confidence: conf.map(r4) },
    ref,
    promo,
    seasons: [
      { key: "buenFin", from: "2026-11-13", to: "2026-11-16" },
      { key: "december", from: "2026-12-01", to: "2026-12-31" },
      { key: "january", from: "2027-01-01", to: "2027-01-31" },
    ],
    analogs,
    stories: [
      { id: 1, key: "newEntrantGrowth", brand: "ZHE" },
      { id: 2, key: "seasonality" },
      { id: 3, key: "leadingIndicator", brand: "QIY", stores: ["QRO", "PUE"] },
      { id: 4, key: "creditSensitivity" },
      { id: 5, key: "mixShift", stores: ["SAT"] },
      { id: 6, key: "decline", model: "K3" },
    ],
  };
  const history: History = { series, leads };
  const inventory: Inventory = { lines, recentOrders, source: onhand.source };
  return { world, history, inventory, truthMu };
}

if (require.main === module) {
  const out = path.join(__dirname, "..", "src", "data");
  fs.mkdirSync(out, { recursive: true });
  const g = generate(SEED);
  fs.writeFileSync(path.join(out, "world.json"), JSON.stringify(g.world));
  fs.writeFileSync(path.join(out, "history.json"), JSON.stringify(g.history));
  fs.writeFileSync(path.join(out, "inventory.json"), JSON.stringify(g.inventory));
  const tot = g.history.series.reduce((a, s) => a + s.sales.slice(-12).reduce((x, y) => x + y, 0), 0);
  console.log(`generate-data: ${g.history.series.length} series, ${g.inventory.lines.length} order lines, last-12-month units ${tot}`);
}

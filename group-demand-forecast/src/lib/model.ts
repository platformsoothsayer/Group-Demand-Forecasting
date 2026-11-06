/**
 * Demand model, fitted at build time.
 *
 * Mature series (dealership x model): negative binomial regression, log link, fitted by penalized IRLS.
 *   log mu_t = level + trend * (t - tEnd)/12 + month-of-year (Jan reference)
 *            + b_credit * financingShare * (credit - ref) + b_fuel * (fuel - ref)/10 + b_conf * (conf - ref)/5
 *            + b_leads * log(lead index, lagged 1 month, centered) + b_promo * campaign depth
 *   Observations are weighted with a 24 month half life so the trend is local.
 * Partial pooling (empirical Bayes, two levels):
 *   1. segment-level fits (all series of a segment, shared coefficients) are shrunk toward the group mean
 *      across segments (DerSimonian-Laird between-segment variance),
 *   2. series coefficients get a normal prior centered on their segment (trend: on their model) with
 *      between-series variance estimated by method of moments.
 * New models (cold start): mature level x lifecycle curve from analog launches, Bayesian (Gamma) update of the
 *   level from early sales with a prior scaled by the dealership's share of current leads, model averaging
 *   over analogs, and launch-phase level drift estimated from the analogs.
 * Sample paths: parameter draws (series and shared segment uncertainty), market indicator paths, lead paths and
 *   negative binomial noise. Then OLS reconciliation shifts every path so all levels add up.
 */
import type { History, Segment, SeriesHistory, World } from "./types";
import { calOf } from "./calendar";
import { coefSegment, confX, creditX, fuelX, leadIndex } from "./drivers";
import { Rng } from "./rng";
import { cholesky, cholSolve, dot, lowerMul, spdInverse, type Mat } from "./linalg";
import { buildNodes, olsReconcile, structureFactor, type HNode, type SeriesKey } from "./reconcile";
import { fitMix, shareAt, type MixFit } from "./mix";

export const NC = 18;
export const COL = { intercept: 0, trend: 1, season: 2, credit: 13, fuel: 14, conf: 15, leads: 16, promo: 17 } as const;
export const COL_NAMES = ["level", "trend", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec", "credit", "fuel", "confidence", "leads", "promo"];
const HALF_LIFE = 24;
const LEAD_DECAY = 0.85;
type PoolSeg = Exclude<Segment, "newEntrant">;
export const POOL_SEGS: PoolSeg[] = ["volume", "pickup", "premium", "luxury"];

// ------------------------------------------------------------------ context

export interface Ctx {
  world: World;
  tEnd: number;
  H: number;
  series: SeriesHistory[];
  keys: SeriesKey[];
  seg: Segment[];
  brand: string[];
  leadLog: Record<string, number[]>;
  leadRaw: Record<string, number[]>;
  leadRef: Record<string, number>;
  leadFuture: Record<string, number[]>;
  start: Record<string, number>;
}

export function makeCtx(world: World, history: History, tEnd: number, minHist = 1): Ctx {
  const modelById = Object.fromEntries(world.models.map((m) => [m.id, m]));
  const series = history.series.filter((s) => s.startT <= tEnd - (minHist - 1));
  const leadLog: Record<string, number[]> = {};
  const leadRaw: Record<string, number[]> = {};
  const leadRef: Record<string, number> = {};
  const leadFuture: Record<string, number[]> = {};
  const start: Record<string, number> = {};
  for (const l of history.leads) {
    const k = `${l.store}|${l.brand}`;
    const raw = l.web.slice(0, tEnd + 1).map((w, t) => leadIndex(w, l.testDrives[t]));
    leadRaw[k] = raw;
    leadLog[k] = raw.map((v) => (v > 0 ? Math.log(v) : NaN));
    const st = raw.findIndex((v) => v > 0);
    start[k] = st < 0 ? tEnd + 1 : st;
    const obs = leadLog[k].filter((v) => !Number.isNaN(v));
    leadRef[k] = obs.length ? obs.reduce((a, b) => a + b, 0) / obs.length : 0;
    const recent = leadLog[k].slice(Math.max(start[k], tEnd - 5)).filter((v) => !Number.isNaN(v));
    const m6 = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    const last = leadLog[k][tEnd];
    leadFuture[k] = [];
    for (let u = tEnd + 1; u < tEnd + 1 + 6; u++) leadFuture[k].push(Number.isNaN(last) ? m6 : m6 + Math.pow(LEAD_DECAY, u - tEnd) * (last - m6));
  }
  return {
    world,
    tEnd,
    H: world.horizon,
    series,
    keys: series.map((s) => ({ store: s.store, model: s.model })),
    seg: series.map((s) => modelById[s.model].segment),
    brand: series.map((s) => modelById[s.model].brand),
    leadLog,
    leadRaw,
    leadRef,
    leadFuture,
    start,
  };
}

/** Market indicator value at month t: observed up to tEnd, then the baseline path (production) or last value (backtest). */
export function indicator(ctx: Ctx, name: "credit" | "fuel" | "confidence", t: number): number {
  const arr = ctx.world.indicators[name];
  if (t <= ctx.tEnd) return arr[t];
  if (ctx.tEnd === ctx.world.hist - 1) return arr[t];
  return arr[ctx.tEnd];
}

/** Log lead index of store x brand at month u (observed or baseline path). */
export function leadLogAt(ctx: Ctx, sb: string, u: number): number {
  if (u < ctx.start[sb]) return NaN;
  if (u <= ctx.tEnd) return ctx.leadLog[sb][u];
  return ctx.leadFuture[sb][u - ctx.tEnd - 1];
}

export interface RowOverride {
  credit?: number;
  fuel?: number;
  confidence?: number;
  leadLog?: number;
}

/** Design row for series i at month t. */
export function row(ctx: Ctx, i: number, t: number, o?: RowOverride): number[] {
  const x = new Array(NC).fill(0);
  const s = ctx.series[i];
  const sb = `${s.store}|${ctx.brand[i]}`;
  x[COL.intercept] = 1;
  x[COL.trend] = (t - ctx.tEnd) / 12;
  const cal = calOf(t);
  if (cal >= 1) x[COL.season + cal - 1] = 1;
  const seg = ctx.seg[i];
  x[COL.credit] = creditX(ctx.world, seg, o?.credit ?? indicator(ctx, "credit", t));
  x[COL.fuel] = fuelX(ctx.world, o?.fuel ?? indicator(ctx, "fuel", t));
  x[COL.conf] = confX(ctx.world, o?.confidence ?? indicator(ctx, "confidence", t));
  const ll = o?.leadLog ?? leadLogAt(ctx, sb, t - 1);
  x[COL.leads] = Number.isNaN(ll) || t - 1 < s.startT ? 0 : ll - ctx.leadRef[sb];
  x[COL.promo] = ctx.world.promo[ctx.brand[i]][t] ?? 0;
  return x;
}

// ------------------------------------------------------------------ penalized NB IRLS

export interface NBFit {
  beta: number[];
  cov: Mat;
  mu: number[];
}

export function fitNB(
  X: Mat,
  y: number[],
  o: { k: number; obsW?: number[]; offset?: number[]; priorMean: number[]; priorPrec: number[]; init?: number[] },
): NBFit {
  const n = X.length;
  const p = X[0].length;
  let beta = o.init ? o.init.slice() : o.priorMean.slice();
  if (!o.init) {
    const ybar = y.reduce((a, b) => a + b, 0) / Math.max(1, n);
    beta[0] = Math.log(ybar + 0.5);
  }
  let H: Mat = [];
  let mu: number[] = [];
  for (let it = 0; it < 60; it++) {
    H = Array.from({ length: p }, () => new Array(p).fill(0));
    const g = new Array(p).fill(0);
    mu = new Array(n);
    for (let r = 0; r < n; r++) {
      const xr = X[r];
      const off = o.offset ? o.offset[r] : 0;
      const eta = Math.max(-12, Math.min(12, dot(xr, beta) + off));
      const m = Math.exp(eta);
      mu[r] = m;
      const w = (o.obsW ? o.obsW[r] : 1) * (m / (1 + m / o.k));
      const z = eta - off + (y[r] - m) / m;
      for (let a = 0; a < p; a++) {
        const xa = xr[a];
        if (xa === 0) continue;
        g[a] += w * xa * z;
        const wa = w * xa;
        for (let b = 0; b <= a; b++) if (xr[b] !== 0) H[a][b] += wa * xr[b];
      }
    }
    for (let a = 0; a < p; a++) {
      for (let b = 0; b < a; b++) H[b][a] = H[a][b];
      H[a][a] += o.priorPrec[a];
      g[a] += o.priorPrec[a] * o.priorMean[a];
    }
    const next = cholSolve(cholesky(H), g);
    let mx = 0;
    for (let a = 0; a < p; a++) mx = Math.max(mx, Math.abs(next[a] - beta[a]));
    const scale = mx > 3 ? 3 / mx : 1;
    beta = beta.map((b, a) => b + scale * (next[a] - b));
    if (mx < 1e-8) break;
  }
  return { beta, cov: spdInverse(H), mu };
}

function momentK(y: number[], mu: number[], w: number[]): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < y.length; i++) {
    num += w[i] * ((y[i] - mu[i]) ** 2 - y[i]);
    den += w[i] * mu[i] * mu[i];
  }
  const inv = num / den;
  return Math.max(3, Math.min(300, inv > 0 ? 1 / inv : 300));
}

/** DerSimonian-Laird random effects shrinkage. Returns pooled mean, between variance and posterior estimates. */
export function ebShrink(est: number[], v: number[], floor: number) {
  const n = est.length;
  const w = v.map((x) => 1 / x);
  const sw = w.reduce((a, b) => a + b, 0);
  const m0 = est.reduce((a, e, i) => a + w[i] * e, 0) / sw;
  const Q = est.reduce((a, e, i) => a + w[i] * (e - m0) ** 2, 0);
  const c = sw - w.reduce((a, b) => a + b * b, 0) / sw;
  const tau2 = n > 1 ? Math.max(floor, (Q - (n - 1)) / Math.max(c, 1e-12)) : floor;
  const ws = v.map((x) => 1 / (x + tau2));
  const sws = ws.reduce((a, b) => a + b, 0);
  const mean = est.reduce((a, e, i) => a + ws[i] * e, 0) / sws;
  const meanVar = 1 / sws;
  const post = est.map((e, i) => (tau2 < 1e-12 ? mean : (e / v[i] + mean / tau2) / (1 / v[i] + 1 / tau2)));
  const postVar = v.map((x) => (tau2 < 1e-12 ? meanVar : 1 / (1 / x + 1 / tau2)));
  return { mean, meanVar, tau2, post, postVar };
}

// ------------------------------------------------------------------ mature series

/** Floors for the between-series prior variance (coefficient index -> variance). */
function tauFloor(c: number): number {
  if (c === COL.trend) return 0.05 ** 2;
  if (c >= COL.season && c < COL.credit) return 0.04 ** 2;
  if (c === COL.leads) return 0.05 ** 2;
  if (c === COL.promo) return 0.2 ** 2;
  return 0.02 ** 2;
}

/** Floors for the between-segment variance: segments may differ, noisy segments borrow from the group. */
function betweenSegmentFloor(c: number): number {
  if (c === COL.trend) return 0.05 ** 2;
  if (c >= COL.season && c < COL.credit) return 0.03 ** 2;
  if (c === COL.credit) return 0.02 ** 2;
  if (c === COL.fuel) return 0.05 ** 2;
  if (c === COL.conf) return 0.05 ** 2;
  if (c === COL.leads) return 0.1 ** 2;
  return 0.5 ** 2;
}

export interface SegmentInfo {
  seg: PoolSeg;
  k: number;
  raw: number[]; // pooled estimate, shared coefficients (index 1..17, index 0 unused)
  rawVar: number[];
  shrunk: number[];
  shrunkVar: number[];
  tau2: number[]; // between-series prior variance by coefficient
  nSeries: number;
}

export interface MatureFit {
  beta: number[];
  V: Mat;
  Vchol: Mat;
  prec: number[];
  k: number;
}

export interface MatureResult {
  fits: Record<number, MatureFit>;
  segments: Record<PoolSeg, SegmentInfo>;
  global: { mean: number[]; tau2: number[] };
  modelTrend: Record<string, { mean: number; v: number }>;
}

function seriesRows(ctx: Ctx, i: number) {
  const s = ctx.series[i];
  const X: Mat = [];
  const y: number[] = [];
  const w: number[] = [];
  for (let t = Math.max(1, s.startT + 1); t <= ctx.tEnd; t++) {
    X.push(row(ctx, i, t));
    y.push(s.sales[t]);
    w.push(Math.pow(0.5, (ctx.tEnd - t) / HALF_LIFE));
  }
  return { X, y, w };
}

export function fitMature(ctx: Ctx): MatureResult {
  const idxBySeg: Record<PoolSeg, number[]> = { volume: [], pickup: [], premium: [], luxury: [] };
  ctx.seg.forEach((g, i) => {
    if (g !== "newEntrant") idxBySeg[g].push(i);
  });
  const rowsCache: Record<number, ReturnType<typeof seriesRows>> = {};
  for (const g of POOL_SEGS) for (const i of idxBySeg[g]) rowsCache[i] = seriesRows(ctx, i);

  // 1. pooled segment fits: series intercepts, model-level trends, shared season and driver coefficients
  const segRaw: Partial<Record<PoolSeg, { b: number[]; v: number[]; k: number }>> = {};
  for (const g of POOL_SEGS) {
    const ids = idxBySeg[g];
    const ns = ids.length;
    const segModels = [...new Set(ids.map((i) => ctx.series[i].model))];
    const nm = segModels.length;
    const off = ns + nm; // shared columns start (NC - 2 of them: season and drivers)
    const P = off + NC - 2;
    const X: Mat = [];
    const y: number[] = [];
    const w: number[] = [];
    ids.forEach((i, si) => {
      const r = rowsCache[i];
      const mIdx = segModels.indexOf(ctx.series[i].model);
      r.X.forEach((xr, ri) => {
        const z = new Array(P).fill(0);
        z[si] = 1;
        z[ns + mIdx] = xr[COL.trend];
        for (let c = 2; c < NC; c++) z[off + c - 2] = xr[c];
        X.push(z);
        y.push(r.y[ri]);
        w.push(r.w[ri]);
      });
    });
    const init = new Array(P).fill(0);
    ids.forEach((i, si) => {
      const r = rowsCache[i];
      init[si] = Math.log(r.y.reduce((a, b) => a + b, 0) / r.y.length + 0.5);
    });
    const prec = new Array(P).fill(0).map((_, a) => (a < ns ? 0 : 0.01));
    let k = 30;
    let fit = fitNB(X, y, { k, obsW: w, priorMean: new Array(P).fill(0), priorPrec: prec, init });
    k = momentK(y, fit.mu, w);
    fit = fitNB(X, y, { k, obsW: w, priorMean: new Array(P).fill(0), priorPrec: prec, init: fit.beta });
    const b = new Array(NC).fill(0);
    const v = new Array(NC).fill(0);
    for (let c = 2; c < NC; c++) {
      b[c] = fit.beta[off + c - 2];
      v[c] = fit.cov[off + c - 2][off + c - 2];
    }
    // segment trend = precision-weighted mean of its model trends
    let sw = 0;
    let sb = 0;
    for (let q = 0; q < nm; q++) {
      const vv = fit.cov[ns + q][ns + q];
      sw += 1 / vv;
      sb += fit.beta[ns + q] / vv;
    }
    b[COL.trend] = sb / sw;
    v[COL.trend] = 1 / sw;
    segRaw[g] = { b, v, k };
  }

  // 2. shrink segment estimates toward the group mean (seasonality: within its season group)
  const gMean = new Array(NC).fill(0);
  const gTau = new Array(NC).fill(0);
  const shrunk: Record<PoolSeg, { b: number[]; v: number[] }> = {} as never;
  for (const g of POOL_SEGS) shrunk[g] = { b: new Array(NC).fill(0), v: new Array(NC).fill(0) };
  const seasonGroups: PoolSeg[][] = [
    ["volume", "pickup"],
    ["premium", "luxury"],
  ];
  for (let c = 1; c < NC; c++) {
    const isSeason = c >= COL.season && c < COL.credit;
    const groups = isSeason ? seasonGroups : [POOL_SEGS];
    for (const grp of groups) {
      const r = ebShrink(
        grp.map((g) => segRaw[g]!.b[c]),
        grp.map((g) => segRaw[g]!.v[c]),
        betweenSegmentFloor(c),
      );
      if (!isSeason) {
        gMean[c] = r.mean;
        gTau[c] = r.tau2;
      }
      grp.forEach((g, gi) => {
        shrunk[g].b[c] = r.post[gi];
        shrunk[g].v[c] = r.postVar[gi];
      });
    }
  }

  // 3. light series fits to estimate between-series variance
  const light: Record<number, NBFit> = {};
  for (const g of POOL_SEGS) {
    for (const i of idxBySeg[g]) {
      const r = rowsCache[i];
      const pm = shrunk[g].b.slice();
      const pp = new Array(NC).fill(1);
      pp[0] = 0;
      light[i] = fitNB(r.X, r.y, { k: segRaw[g]!.k, obsW: r.w, priorMean: pm, priorPrec: pp });
    }
  }
  // trend: series -> model -> segment
  const modelTrend: Record<string, { mean: number; v: number }> = {};
  const withinModelTau: Record<PoolSeg, number> = { volume: 0, pickup: 0, premium: 0, luxury: 0 };
  for (const g of POOL_SEGS) {
    const models = [...new Set(idxBySeg[g].map((i) => ctx.series[i].model))];
    const mEst: number[] = [];
    const mVar: number[] = [];
    const taus: number[] = [];
    for (const m of models) {
      const ids = idxBySeg[g].filter((i) => ctx.series[i].model === m);
      const r = ebShrink(
        ids.map((i) => light[i].beta[COL.trend]),
        ids.map((i) => light[i].cov[COL.trend][COL.trend]),
        tauFloor(COL.trend),
      );
      mEst.push(r.mean);
      mVar.push(r.meanVar);
      taus.push(r.tau2);
    }
    const r2 = ebShrink(mEst, mVar, 0.03 ** 2);
    models.forEach((m, mi) => (modelTrend[m] = { mean: r2.post[mi], v: r2.postVar[mi] }));
    withinModelTau[g] = taus.reduce((a, b) => a + b, 0) / taus.length;
  }

  // 4. final series fits with the hierarchical prior
  const fits: Record<number, MatureFit> = {};
  const segments = {} as Record<PoolSeg, SegmentInfo>;
  for (const g of POOL_SEGS) {
    const ids = idxBySeg[g];
    const tau2 = new Array(NC).fill(0);
    for (let c = 1; c < NC; c++) {
      if (c === COL.trend) {
        tau2[c] = withinModelTau[g];
        continue;
      }
      const est = ids.map((i) => light[i].beta[c]);
      const mean = est.reduce((a, b) => a + b, 0) / est.length;
      const varEst = est.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, est.length - 1);
      const sampling = ids.reduce((a, i) => a + light[i].cov[c][c], 0) / ids.length;
      tau2[c] = Math.max(tauFloor(c), Math.min(varEst - sampling, 0.25));
    }
    segments[g] = {
      seg: g,
      k: segRaw[g]!.k,
      raw: segRaw[g]!.b,
      rawVar: segRaw[g]!.v,
      shrunk: shrunk[g].b,
      shrunkVar: shrunk[g].v,
      tau2,
      nSeries: ids.length,
    };
    for (const i of ids) {
      const r = rowsCache[i];
      const pm = shrunk[g].b.slice();
      pm[COL.trend] = modelTrend[ctx.series[i].model].mean;
      const prec = tau2.map((t, c) => (c === 0 ? 0 : 1 / t));
      const f = fitNB(r.X, r.y, { k: segRaw[g]!.k, obsW: r.w, priorMean: pm, priorPrec: prec, init: light[i].beta });
      fits[i] = { beta: f.beta, V: f.cov, Vchol: cholesky(f.cov), prec, k: segRaw[g]!.k };
    }
  }
  return { fits, segments, global: { mean: gMean, tau2: gTau }, modelTrend };
}

// ------------------------------------------------------------------ analogs and cold start

export const lifecycle = (a: number, tau: number) => (a < 0 ? 0 : 1 - Math.exp(-(a + 1) / tau));

export interface AnalogFit {
  id: string;
  brand: string;
  model: string;
  launchYear: number;
  launchMonth: number;
  tau: number;
  M: number;
  sigma: number;
  /** Normalized actual sales (sales / (M x season)) and fitted curve for months 0..23. */
  actualNorm: number[];
  curve: number[];
}

export function seasonEffect(seg: SegmentInfo, cal: number): number {
  return cal >= 1 ? seg.shrunk[COL.season + cal - 1] : 0;
}

export function fitAnalogs(world: World, segments: Record<PoolSeg, SegmentInfo>): AnalogFit[] {
  return world.analogs.map((a) => {
    const sg = segments[coefSegment(a.segment)];
    const se = a.sales.map((_, k) => Math.exp(seasonEffect(sg, (a.launchMonth + k) % 12)));
    let best = { tau: 4, M: 1, ll: -Infinity };
    for (let tau = 1.5; tau <= 12.0001; tau += 0.05) {
      const f = a.sales.map((_, k) => lifecycle(k, tau) * se[k]);
      const M = a.sales.reduce((x, y) => x + y, 0) / f.reduce((x, y) => x + y, 0);
      const ll = a.sales.reduce((acc, y, k) => acc + y * Math.log(M * f[k]) - M * f[k], 0);
      if (ll > best.ll) best = { tau: Math.round(tau * 100) / 100, M, ll };
    }
    const fit = a.sales.map((_, k) => best.M * lifecycle(k, best.tau) * se[k]);
    const r = a.sales.map((y, k) => Math.log((y + 0.5) / fit[k]));
    const d = r.slice(1, 18).map((v, k) => v - r[k]);
    const dm = d.reduce((x, y) => x + y, 0) / d.length;
    const vd = d.reduce((x, y) => x + (y - dm) ** 2, 0) / (d.length - 1);
    const noise = fit.slice(0, 18).reduce((x, m) => x + 1 / m + 1 / 30, 0) / 18;
    const sigma = Math.sqrt(Math.max(0.05 ** 2, vd - 2 * noise));
    return {
      id: a.id,
      brand: a.brand,
      model: a.model,
      launchYear: a.launchYear,
      launchMonth: a.launchMonth,
      tau: best.tau,
      M: best.M,
      sigma,
      actualNorm: a.sales.map((y, k) => y / (best.M * se[k])),
      curve: a.sales.map((_, k) => lifecycle(k, best.tau)),
    };
  });
}

/**
 * Launch-phase drift calibrated on past launches, leave one out: forecast each analog from ages 6 to 12 with
 * the other analogs' curves, measure the log error 1 to 6 months ahead (net of count noise), and express it
 * as a per-month random walk variance.
 */
export function calibrateLaunchDrift(world: World, analogs: AnalogFit[], segments: Record<PoolSeg, SegmentInfo>): number {
  let num = 0;
  let den = 0;
  world.analogs.forEach((a, ai) => {
    const sg = segments[coefSegment(a.segment)];
    const se = a.sales.map((_, k) => Math.exp(seasonEffect(sg, (a.launchMonth + k) % 12)));
    const others = analogs.filter((_, bi) => bi !== ai);
    for (let o = 6; o <= 12; o++) {
      const F = new Array(7).fill(0);
      for (const b of others) {
        let sy = 0;
        let sf = 0;
        for (let k = 0; k <= o; k++) {
          sy += a.sales[k];
          sf += lifecycle(k, b.tau) * se[k];
        }
        for (let h = 1; h <= 6; h++) F[h] += ((sy / sf) * lifecycle(o + h, b.tau) * se[o + h]) / others.length;
      }
      for (let h = 1; h <= 6; h++) {
        const e = Math.log((a.sales[o + h] + 0.5) / F[h]);
        num += e * e - 1 / F[h];
        den += h;
      }
    }
  });
  return Math.sqrt(Math.max(0.05 ** 2, num / den));
}

/**
 * Common monthly demand shock: aggregate relative residual of all mature series over the last 24 months,
 * minus the variance expected if series were independent.
 */
export function commonShockSigma(ctx: Ctx, mature: MatureResult): number {
  const ids = Object.keys(mature.fits).map(Number);
  const r: number[] = [];
  const ind: number[] = [];
  for (let t = Math.max(1, ctx.tEnd - 23); t <= ctx.tEnd; t++) {
    let res = 0;
    let mu = 0;
    let v = 0;
    for (const i of ids) {
      const m = Math.exp(dot(row(ctx, i, t), mature.fits[i].beta));
      res += ctx.series[i].sales[t] - m;
      mu += m;
      v += m + (m * m) / mature.fits[i].k;
    }
    r.push(res / mu);
    ind.push(v / (mu * mu));
  }
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const varR = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  const expect = ind.reduce((a, b) => a + b, 0) / ind.length;
  return Math.sqrt(Math.max(0, varR - expect));
}

/** Similarity weights of analog launches for a new model: price proximity and body type. */
export function analogWeights(world: World, modelId: string, analogs: AnalogFit[]): number[] {
  const m = world.models.find((x) => x.id === modelId)!;
  const raw = analogs.map((a) => {
    const am = world.models.find((x) => x.id === a.model)!;
    const price = Math.exp(-Math.abs(Math.log(m.msrpBase / am.msrpBase)) / 0.35);
    const body = am.body === m.body || (m.body.includes("Suv") && am.body.includes("Suv")) ? (am.body === m.body ? 1.6 : 1.2) : 1;
    return price * body;
  });
  const s = raw.reduce((a, b) => a + b, 0);
  return raw.map((x) => x / s);
}

/** Log gamma function (Lanczos approximation). */
export function lgamma(x: number): number {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

export interface ColdFit {
  /** Posterior analog weights: similarity prior x fit to early sales. */
  weights: number[];
  priorWeights: number[];
  shape: number[];
  rate: number[];
  launchT: number;
  /** Posterior mean level under each analog. */
  M: number[];
  prior: number[];
  leadShare: number;
}

/** Coefficients used for new entrants: the volume segment (they sell into the volume market). */
export function newEntrantCoef(m: MatureResult): number[] {
  return m.segments.volume.shrunk.slice();
}

function etaNoLevel(x: number[], b: number[]): number {
  let s = 0;
  for (let c = COL.season; c < NC; c++) s += x[c] * b[c];
  return s;
}

export function fitCold(ctx: Ctx, mature: MatureResult, analogs: AnalogFit[]): Record<number, ColdFit> {
  const b = newEntrantCoef(mature);
  const out: Record<number, ColdFit> = {};
  const ids = ctx.seg.map((g, i) => (g === "newEntrant" ? i : -1)).filter((i) => i >= 0);
  const models = [...new Set(ids.map((i) => ctx.series[i].model))];
  const alpha0 = 3;
  for (const m of models) {
    const mi = ids.filter((i) => ctx.series[i].model === m);
    const brand = ctx.brand[mi[0]];
    const launchT = ctx.world.brands.find((x) => x.id === brand)!.launchT ?? 0;
    const w0 = analogWeights(ctx.world, m, analogs);
    // dealership share of current brand leads (last 3 months)
    const recentLead = (i: number) => {
      const arr = ctx.leadRaw[`${ctx.series[i].store}|${brand}`];
      return arr.slice(ctx.tEnd - 2).reduce((x, y) => x + y, 0) / 3;
    };
    const totLead = mi.reduce((a, i) => a + recentLead(i), 0);
    const share = mi.map((i) => recentLead(i) / totLead);
    // lifecycle x season x drivers by analog, series and month
    const f = mi.map((i) => {
      const s = ctx.series[i];
      return analogs.map((a) => {
        const arr: number[] = [];
        for (let t = s.startT; t <= ctx.tEnd; t++) arr.push(lifecycle(t - launchT, a.tau) * Math.exp(etaNoLevel(row(ctx, i, t), b)));
        return arr;
      });
    });
    const expo = f.map((byA) => byA.map((arr) => arr.reduce((x, y) => x + y, 0)));
    const ys = mi.map((i) => {
      const s = ctx.series[i];
      return s.sales.slice(s.startT, ctx.tEnd + 1);
    });
    const sumY = ys.map((y) => y.reduce((a, v) => a + v, 0));
    const kq = mature.segments.volume.k;
    const logEv = analogs.map(() => 0);
    const fits = mi.map((i, j) => {
      const shape: number[] = [];
      const rate: number[] = [];
      const prior: number[] = [];
      analogs.forEach((_, a) => {
        const Mmodel = sumY.reduce((x, y) => x + y, 0) / mi.reduce((x, _i, jj) => x + share[jj] * expo[jj][a], 0);
        const M0 = Math.max(0.2, Mmodel * share[j]);
        prior.push(M0);
        const sh = alpha0 + sumY[j];
        const rt = alpha0 / M0 + expo[j][a];
        shape.push(sh);
        rate.push(rt);
        // Gamma-Poisson marginal likelihood, scaled by the overdispersion factor (quasi-likelihood)
        let ll = lgamma(sh) - lgamma(alpha0) + alpha0 * Math.log(alpha0 / M0) - sh * Math.log(rt);
        ys[j].forEach((y, k) => (ll += y * Math.log(f[j][a][k])));
        const phi = 1 + sumY[j] / ys[j].length / kq;
        logEv[a] += ll / phi;
      });
      return { shape, rate, prior };
    });
    const mx = Math.max(...logEv);
    const post = w0.map((p, a) => p * Math.exp(logEv[a] - mx));
    const ps = post.reduce((a, v) => a + v, 0);
    const w = post.map((v) => v / ps);
    mi.forEach((i, j) => {
      const { shape, rate, prior } = fits[j];
      out[i] = { weights: w, priorWeights: w0, shape, rate, launchT, M: shape.map((sh, a) => sh / rate[a]), prior, leadShare: share[j] };
    });
  }
  return out;
}

// ------------------------------------------------------------------ point components for explanations

export type CompKey = "base" | "season" | "trend" | "leads" | "promo" | "market";
export const COMP_KEYS: CompKey[] = ["base", "season", "trend", "leads", "promo", "market"];

export function components(ctx: Ctx, i: number, t: number, mature: MatureResult, cold: Record<number, ColdFit>, analogs: AnalogFit[]): Record<CompKey, number> {
  const x = row(ctx, i, t);
  const isCold = ctx.seg[i] === "newEntrant";
  const b = isCold ? newEntrantCoef(mature) : mature.fits[i].beta;
  let season = 0;
  for (let c = COL.season; c < COL.credit; c++) season += x[c] * b[c];
  const market = x[COL.credit] * b[COL.credit] + x[COL.fuel] * b[COL.fuel] + x[COL.conf] * b[COL.conf];
  const leads = x[COL.leads] * b[COL.leads];
  const promo = x[COL.promo] * b[COL.promo];
  if (!isCold) return { base: b[0], season, trend: x[COL.trend] * b[COL.trend], leads, promo, market };
  const cf = cold[i];
  const Mbar = cf.weights.reduce((a, w, k) => a + w * cf.M[k], 0);
  const lev = cf.weights.reduce((a, w, k) => a + w * cf.M[k] * lifecycle(t - cf.launchT, analogs[k].tau), 0);
  return { base: Math.log(Mbar), season, trend: Math.log(Math.max(lev, 1e-6)) - Math.log(Mbar), leads, promo, market };
}

// ------------------------------------------------------------------ upper-level base models

export function fitUpper(ctx: Ctx, node: HNode, mature: MatureResult, coldMean: number[][]): number[] {
  const H = ctx.H;
  const matureIds = node.bottoms.filter((i) => ctx.seg[i] !== "newEntrant");
  const coldIds = node.bottoms.filter((i) => ctx.seg[i] === "newEntrant");
  const out = new Array(H).fill(0);
  for (const i of coldIds) for (let h = 0; h < H; h++) out[h] += coldMean[i][h];
  if (!matureIds.length) return out;
  const tot = matureIds.map((i) => ctx.series[i].sales.slice(1, ctx.tEnd + 1).reduce((a, b) => a + b, 0));
  const all = tot.reduce((a, b) => a + b, 0);
  const omega = tot.map((x) => x / all);
  const sbs = [...new Set(matureIds.map((i) => `${ctx.series[i].store}|${ctx.brand[i]}`))];
  const aggLog = (u: number) => {
    let s = 0;
    for (const sb of sbs) {
      const v = leadLogAt(ctx, sb, u);
      if (!Number.isNaN(v)) s += Math.exp(v);
    }
    return Math.log(Math.max(s, 1e-9));
  };
  let refSum = 0;
  for (let u = 0; u < ctx.tEnd; u++) refSum += aggLog(u);
  const ref = refSum / ctx.tEnd;
  const aggRow = (t: number) => {
    const x = new Array(NC).fill(0);
    matureIds.forEach((i, j) => {
      const r = row(ctx, i, t);
      for (let c = 0; c < NC; c++) if (c !== COL.leads) x[c] += omega[j] * r[c];
    });
    x[COL.leads] = aggLog(t - 1) - ref;
    return x;
  };
  const X: Mat = [];
  const y: number[] = [];
  const w: number[] = [];
  for (let t = 1; t <= ctx.tEnd; t++) {
    X.push(aggRow(t));
    y.push(matureIds.reduce((a, i) => a + ctx.series[i].sales[t], 0));
    w.push(Math.pow(0.5, (ctx.tEnd - t) / HALF_LIFE));
  }
  const pm = new Array(NC).fill(0);
  matureIds.forEach((i, j) => {
    for (let c = 1; c < NC; c++) pm[c] += omega[j] * mature.fits[i].beta[c];
  });
  const pp = new Array(NC).fill(0).map((_, c) => (c === 0 ? 0 : c >= COL.season && c < COL.credit ? 100 : 25));
  let k = 50;
  let fit = fitNB(X, y, { k, obsW: w, priorMean: pm, priorPrec: pp });
  k = momentK(y, fit.mu, w);
  fit = fitNB(X, y, { k, obsW: w, priorMean: pm, priorPrec: pp, init: fit.beta });
  for (let h = 0; h < H; h++) {
    const x = aggRow(ctx.tEnd + 1 + h);
    const eta = dot(x, fit.beta);
    const vx = dot(x, fit.cov.map((r) => dot(r, x)));
    out[h] += Math.exp(eta + 0.5 * vx);
  }
  return out;
}

// ------------------------------------------------------------------ sample paths

export interface PathOptions {
  nPaths: number;
  seed: number;
}

/** Simulate base (unreconciled) sample paths for every bottom series: result[i][h][j] (integer units). */
export interface Uncertainty {
  launchDrift: number;
  commonShock: number;
}

export function simulate(ctx: Ctx, mature: MatureResult, cold: Record<number, ColdFit>, analogs: AnalogFit[], u: Uncertainty, o: PathOptions): number[][][] {
  const rng = new Rng(o.seed);
  const H = ctx.H;
  const nS = ctx.series.length;
  const out: number[][][] = Array.from({ length: nS }, () => Array.from({ length: H }, () => new Array(o.nPaths).fill(0)));
  const bNew = newEntrantCoef(mature);
  const kNew = mature.segments.volume.k;
  const sigmaLaunch = u.launchDrift;
  const sc = u.commonShock;
  const sbs = [...new Set(ctx.series.map((s, i) => `${s.store}|${ctx.brand[i]}`))];
  const models = [...new Set(ctx.series.map((s) => s.model))];
  const segChol: Record<string, number[]> = {};
  for (const g of POOL_SEGS) segChol[g] = mature.segments[g].shrunkVar.map((v) => Math.sqrt(v));

  for (let j = 0; j < o.nPaths; j++) {
    // shared market indicator paths
    const credit: number[] = [];
    const fuel: number[] = [];
    const conf: number[] = [];
    let dc = 0, df = 0, dq = 0;
    for (let h = 0; h < H; h++) {
      dc += 0.12 * rng.normal();
      df += 1.5 * rng.normal();
      dq += 0.6 * rng.normal();
      const t = ctx.tEnd + 1 + h;
      credit.push(indicator(ctx, "credit", t) + dc);
      fuel.push(indicator(ctx, "fuel", t) + df);
      conf.push(indicator(ctx, "confidence", t) + dq);
    }
    // common monthly demand shock shared by all series
    const common: number[] = [];
    for (let h = 0; h < H; h++) common.push(sc * rng.normal() - 0.5 * sc * sc);
    // lead paths by store x brand (month u = tEnd .. tEnd+H-1; u = tEnd is observed)
    const lead: Record<string, number[]> = {};
    for (const sb of sbs) {
      const arr = [leadLogAt(ctx, sb, ctx.tEnd)];
      let e = 0;
      for (let u = 1; u < H; u++) {
        e = 0.5 * e + 0.1 * rng.normal();
        arr.push(leadLogAt(ctx, sb, ctx.tEnd + u) + e);
      }
      lead[sb] = arr;
    }
    // shared prior-mean uncertainty: segment coefficients and model trends
    const dSeg: Record<string, number[]> = {};
    for (const g of POOL_SEGS) dSeg[g] = segChol[g].map((s) => s * rng.normal());
    const dTrend: Record<string, number> = {};
    for (const m of models) dTrend[m] = mature.modelTrend[m] ? Math.sqrt(mature.modelTrend[m].v) * rng.normal() : 0;
    // new-model shared draws: analog choice and launch drift
    const analogPick: Record<string, number> = {};
    const drift: Record<string, number[]> = {};
    for (const m of models) {
      const anyCold = ctx.series.findIndex((s, i) => s.model === m && ctx.seg[i] === "newEntrant");
      if (anyCold < 0) continue;
      analogPick[m] = rng.categorical(cold[anyCold].weights);
      const d: number[] = [];
      let x = 0;
      for (let h = 0; h < H; h++) {
        x += sigmaLaunch * rng.normal();
        d.push(x - (0.5 * sigmaLaunch * sigmaLaunch * (h + 1)));
      }
      drift[m] = d;
    }

    for (let i = 0; i < nS; i++) {
      const s = ctx.series[i];
      const sb = `${s.store}|${ctx.brand[i]}`;
      const g = ctx.seg[i];
      if (g === "newEntrant") {
        const cf = cold[i];
        const a = analogPick[s.model];
        const M = rng.gamma(cf.shape[a], 1 / cf.rate[a]);
        for (let h = 0; h < H; h++) {
          const t = ctx.tEnd + 1 + h;
          const x = row(ctx, i, t, { credit: credit[h], fuel: fuel[h], confidence: conf[h], leadLog: lead[sb][h] });
          const mu = M * lifecycle(t - cf.launchT, analogs[a].tau) * Math.exp(etaNoLevel(x, bNew) + drift[s.model][h] + common[h]);
          out[i][h][j] = rng.negbin(mu, kNew);
        }
        continue;
      }
      const f = mature.fits[i];
      // beta draw: posterior plus propagated uncertainty of the prior mean, V P delta
      const delta = new Array(NC).fill(0);
      for (let c = 1; c < NC; c++) delta[c] = c === COL.trend ? dTrend[s.model] : dSeg[g][c];
      const Pd = delta.map((d, c) => d * f.prec[c]);
      const shift = f.V.map((r) => dot(r, Pd));
      const z = new Array(NC).fill(0).map(() => rng.normal());
      const own = lowerMul(f.Vchol, z);
      const beta = f.beta.map((b, c) => b + shift[c] + own[c]);
      for (let h = 0; h < H; h++) {
        const t = ctx.tEnd + 1 + h;
        const x = row(ctx, i, t, { credit: credit[h], fuel: fuel[h], confidence: conf[h], leadLog: lead[sb][h] });
        const mu = Math.exp(Math.min(12, dot(x, beta) + common[h]));
        out[i][h][j] = rng.negbin(mu, f.k);
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ full pipeline

export interface PipelineResult {
  ctx: Ctx;
  nodes: HNode[];
  mature: MatureResult;
  analogs: AnalogFit[];
  cold: Record<number, ColdFit>;
  rawPaths: number[][][];
  uncertainty: Uncertainty;
  /** Reconciliation shift per bottom series and month. Reconciled path = max(0, raw + delta). */
  delta: number[][];
  baseForecast: Record<string, number[]>;
  reconciledBottom: number[][];
  mix: { trim: MixFit[]; color: MixFit[] };
}

export function runPipeline(world: World, history: History, tEnd: number, o: PathOptions & { minHist?: number }): PipelineResult {
  const ctx = makeCtx(world, history, tEnd, o.minHist ?? 1);
  const H = ctx.H;
  const mature = fitMature(ctx);
  const analogs = fitAnalogs(world, mature.segments);
  const cold = fitCold(ctx, mature, analogs);
  const uncertainty: Uncertainty = { launchDrift: calibrateLaunchDrift(world, analogs, mature.segments), commonShock: commonShockSigma(ctx, mature) };
  const rawPaths = simulate(ctx, mature, cold, analogs, uncertainty, o);
  const nS = ctx.series.length;
  const pathMean = rawPaths.map((ser) => ser.map((arr) => arr.reduce((a, b) => a + b, 0) / arr.length));
  const nodes = buildNodes(world, ctx.keys);
  const baseForecast: Record<string, number[]> = {};
  for (const n of nodes) {
    if (!n.inS) continue;
    if (n.level === "storeModel") baseForecast[n.id] = pathMean[n.bottoms[0]].slice();
    else baseForecast[n.id] = fitUpper(ctx, n, mature, pathMean);
  }
  const L = structureFactor(nodes, nS);
  const reconciledBottom: number[][] = Array.from({ length: nS }, () => new Array(H).fill(0));
  for (let h = 0; h < H; h++) {
    const yhat: Record<string, number> = {};
    for (const [id, v] of Object.entries(baseForecast)) yhat[id] = v[h];
    const b = olsReconcile(nodes, L, yhat, nS);
    for (let i = 0; i < nS; i++) reconciledBottom[i][h] = b[i];
  }
  const delta = reconciledBottom.map((r, i) => r.map((v, h) => v - pathMean[i][h]));

  // trim and color mix
  const storeTrim: Record<string, number[]> = {};
  const storeColor: Record<string, number[]> = {};
  for (const s of ctx.series) {
    const tt = (storeTrim[s.store] ??= [0.5, 0.5, 0.5]);
    const cc = (storeColor[s.store] ??= [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    for (let t = 0; t <= tEnd; t++) {
      s.trim[t].forEach((v, k) => (tt[k] += v));
      s.color[t].forEach((v, k) => (cc[k] += v));
    }
  }
  const norm = (v: number[]) => {
    const z = v.reduce((a, b) => a + b, 0);
    return v.map((x) => x / z);
  };
  const trim: MixFit[] = [];
  const color: MixFit[] = [];
  for (const s of ctx.series) {
    const ts: number[] = [];
    for (let t = s.startT; t <= tEnd; t++) ts.push(t);
    trim.push(fitMix(ts.map((t) => s.trim[t]), ts, tEnd, norm(storeTrim[s.store])));
    color.push(fitMix(ts.map((t) => s.color[t]), ts, tEnd, norm(storeColor[s.store])));
  }
  return { ctx, nodes, mature, analogs, cold, rawPaths, uncertainty, delta, baseForecast, reconciledBottom, mix: { trim, color } };
}

export { shareAt };

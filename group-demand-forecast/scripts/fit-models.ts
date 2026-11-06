/** Fits every model at build time and writes src/data/forecast.json and src/data/backtest.json. */
import fs from "node:fs";
import path from "node:path";
import world from "../src/data/world.json";
import history from "../src/data/history.json";
import { SEED, N_PATHS } from "../src/config";
import type { History, World } from "../src/lib/types";
import { COL, COMP_KEYS, POOL_SEGS, components, newEntrantCoef, runPipeline, shareAt } from "../src/lib/model";
import { runBacktest } from "../src/lib/backtest";
import type { ForecastFile } from "../src/lib/forecastFile";

const r = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

export function fitAll(w: World, h: History) {
  const tEnd = w.hist - 1;
  const res = runPipeline(w, h, tEnd, { nPaths: N_PATHS, seed: SEED });
  const { ctx, mature, cold, analogs } = res;
  const H = ctx.H;
  const bNew = newEntrantCoef(mature);
  const out: ForecastFile = {
    tEnd,
    horizon: H,
    nPaths: N_PATHS,
    series: ctx.series.map((s, i) => {
      const isCold = ctx.seg[i] === "newEntrant";
      const b = isCold ? bNew : mature.fits[i].beta;
      const comps = Object.fromEntries(COMP_KEYS.map((k) => [k, [] as number[]])) as ForecastFile["series"][number]["comps"];
      for (let t = tEnd - 2; t <= tEnd + H; t++) {
        const c = components(ctx, i, t, mature, cold, analogs);
        for (const k of COMP_KEYS) comps[k].push(r(c[k]));
      }
      return {
        store: s.store,
        model: s.model,
        seg: ctx.seg[i],
        cold: isCold,
        paths: res.rawPaths[i],
        delta: res.delta[i].map((v) => r(v, 3)),
        coef: { credit: r(b[COL.credit], 5), fuel: r(b[COL.fuel], 5), conf: r(b[COL.conf], 5), leads: r(b[COL.leads], 5), promo: r(b[COL.promo], 5) },
        comps,
        trim: Array.from({ length: H }, (_, hh) => shareAt(res.mix.trim[i], (hh + 1) / 12).map((v) => r(v))),
        color: Array.from({ length: H }, (_, hh) => shareAt(res.mix.color[i], (hh + 1) / 12).map((v) => r(v))),
      };
    }),
    base: Object.fromEntries(Object.entries(res.baseForecast).map(([k, v]) => [k, v.map((x) => r(x, 2))])),
    cold: Object.entries(cold).map(([i, c]) => ({
      series: Number(i),
      launchT: c.launchT,
      weights: c.weights.map((x) => r(x)),
      priorWeights: c.priorWeights.map((x) => r(x)),
      M: c.M.map((x) => r(x, 3)),
      prior: c.prior.map((x) => r(x, 3)),
      leadShare: r(c.leadShare),
    })),
    analogs: analogs.map((a) => ({ ...a, M: r(a.M, 2), sigma: r(a.sigma), actualNorm: a.actualNorm.map((x) => r(x)), curve: a.curve.map((x) => r(x)) })),
    segments: POOL_SEGS.map((g) => {
      const s = mature.segments[g];
      return {
        seg: g,
        k: r(s.k, 1),
        nSeries: s.nSeries,
        credit: r(s.shrunk[COL.credit]),
        fuel: r(s.shrunk[COL.fuel]),
        confidence: r(s.shrunk[COL.conf]),
        leads: r(s.shrunk[COL.leads]),
        promo: r(s.shrunk[COL.promo]),
        season: [0, ...s.shrunk.slice(COL.season, COL.credit)].map((x) => r(x)),
      };
    }),
    leadPath: Object.fromEntries(Object.entries(ctx.leadFuture).map(([k, v]) => [k, v.slice(0, H - 1).map((x) => r(Math.exp(x), 1))])),
  };
  return { forecast: out, res };
}

if (require.main === module) {
  const t0 = Date.now();
  const { forecast } = fitAll(world as World, history as History);
  const t1 = Date.now();
  const bt = runBacktest(world as World, history as History, { seed: SEED });
  const t2 = Date.now();
  const outDir = path.join(__dirname, "..", "src", "data");
  fs.writeFileSync(path.join(outDir, "forecast.json"), JSON.stringify(forecast));
  fs.writeFileSync(path.join(outDir, "backtest.json"), JSON.stringify(bt));
  const fmt = (x: number) => (100 * x).toFixed(1) + "%";
  console.log(`fit-models: ${forecast.series.length} series fitted in ${t1 - t0} ms, backtest ${bt.origins.length} origins in ${t2 - t1} ms`);
  for (const lv of Object.keys(bt.metrics) as (keyof typeof bt.metrics)[]) {
    const m = bt.metrics[lv];
    console.log(`  ${lv.padEnd(11)} WAPE ai ${fmt(m.ai.wape)} snaive ${fmt(m.seasonalNaive.wape)} ma3 ${fmt(m.movingAverage.wape)} | bias ai ${fmt(m.ai.bias)} | P10-P90 coverage ${fmt(bt.coverage[lv])}`);
  }
}

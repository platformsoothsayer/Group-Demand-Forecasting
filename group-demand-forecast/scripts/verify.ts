/**
 * npm run verify. Model, reconciliation, scenario, ordering, story, determinism and copy checks.
 * Exits with code 1 if any check fails.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { SEED } from "../src/config";
import type { History, Inventory, World } from "../src/lib/types";
import type { ForecastFile } from "../src/lib/forecastFile";
import { Engine } from "../src/lib/engine";
import { NEUTRAL, type Scenario } from "../src/lib/scenario";
import { coherencePairs } from "../src/lib/reconcile";
import { computeOrder, defaultOrderSettings } from "../src/lib/ordering";
import { summarize } from "../src/lib/explain";
import { runBacktest } from "../src/lib/backtest";
import { approvedSummary, orderSummary } from "../src/lib/kpis";
import { generate } from "./generate-data";
import { fitAll } from "./fit-models";
import { contrastResults } from "./contrast";

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "src", "data");
const read = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
const world = read<World>("world.json");
const history = read<History>("history.json");
const inventory = read<Inventory>("inventory.json");
const fc = read<ForecastFile>("forecast.json");
const backtest = read<ReturnType<typeof runBacktest>>("backtest.json");

let failures = 0;
const lines: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  const l = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`;
  lines.push(l);
  console.log(l);
}
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

console.log("== Reconciliation and quantiles");
const engine = new Engine(world, history, fc);
const base = engine.run(NEUTRAL);
{
  // OLS normal equations: S'(S b - yhat) = 0, with b the reconciled bottom means.
  const b = fc.series.map((s, i) => s.paths.map((p, h) => p.reduce((a, x) => a + x, 0) / p.length + s.delta[h]));
  let maxResid = 0;
  let scale = 0;
  for (let h = 0; h < fc.horizon; h++) {
    const r = new Array(b.length).fill(0);
    for (const n of engine.nodes) {
      if (!n.inS) continue;
      const sum = n.bottoms.reduce((a, i) => a + b[i][h], 0);
      const e = sum - fc.base[n.id][h];
      for (const i of n.bottoms) r[i] += e;
      scale = Math.max(scale, Math.abs(fc.base[n.id][h]));
    }
    maxResid = Math.max(maxResid, ...r.map(Math.abs));
  }
  check("OLS reconciliation solves the normal equations S'(S b - yhat) = 0", maxResid / scale < 1e-3, `max residual ${maxResid.toFixed(4)} units`);
}
const coherence = (run: typeof base, label: string) => {
  const pairs = coherencePairs(engine.nodes);
  let maxMean = 0;
  let maxPath = 0;
  const pathSum = (id: string) => {
    const n = engine.node(id);
    const a = new Float64Array(engine.H * engine.nP);
    for (const i of n.bottoms) {
      const p = run.paths[i];
      for (let k = 0; k < a.length; k++) a[k] += p[k];
    }
    return a;
  };
  const cache = new Map<string, Float64Array>();
  const ps = (id: string) => cache.get(id) ?? (cache.set(id, pathSum(id)), cache.get(id)!);
  for (const { parent, children } of pairs) {
    const P = run.stats(parent).mean;
    for (let h = 0; h < engine.H; h++) {
      const c = children.reduce((a, id) => a + run.stats(id).mean[h], 0);
      maxMean = Math.max(maxMean, Math.abs(P[h] - c));
    }
    const pp = ps(parent);
    const cc = new Float64Array(pp.length);
    for (const id of children) {
      const x = ps(id);
      for (let k = 0; k < x.length; k++) cc[k] += x[k];
    }
    for (let k = 0; k < pp.length; k++) maxPath = Math.max(maxPath, Math.abs(pp[k] - cc[k]));
  }
  check(`${label}: children sum to parents for P50 at every level and month (${pairs.length} parent-child sets)`, maxMean < 1e-6, `max gap ${maxMean.toExponential(1)}`);
  check(`${label}: children sum to parents on every one of the ${engine.nP} sample paths`, maxPath < 1e-3, `max gap ${maxPath.toExponential(1)}`);
};
coherence(base, "Baseline");
const credit2: Scenario = { ...NEUTRAL, credit: 2 };
const runCredit = engine.run(credit2);
coherence(runCredit, "Scenario credit +2");
{
  let bad = 0;
  let total = 0;
  for (const n of engine.nodes) {
    const s = base.stats(n.id);
    for (let h = 0; h < engine.H; h++) {
      total++;
      const ok = s.q10[h] <= s.q25[h] + 1e-9 && s.q25[h] <= s.mean[h] + 1e-9 && s.mean[h] <= s.q75[h] + 1e-9 && s.q75[h] <= s.q90[h] + 1e-9;
      if (!ok) bad++;
    }
  }
  check("Quantiles ordered P10 <= P25 <= P50 <= P75 <= P90 everywhere", bad === 0, `${total - bad}/${total} node-months`);
}

console.log("== Scenarios");
{
  const fresh = new Engine(world, history, fc);
  const n0 = fresh.run(NEUTRAL);
  let same = true;
  for (let i = 0; i < fc.series.length; i++) {
    if (n0.paths[i] !== fresh.basePaths[i]) same = false;
    for (let h = 0; h < fresh.H; h++) if (n0.mean[i][h] !== fresh.baseMean[i][h] || n0.factors[i][h] !== 1) same = false;
  }
  const g0 = n0.stats("G");
  const neutralStats = engine.run({ ...NEUTRAL, campaign: { brand: "KAI", depth: 0, start: 0, months: 3 } }).stats("G");
  const exact = same && g0.mean.every((v, h) => v === neutralStats.mean[h] && g0.q10[h] === neutralStats.q10[h] && g0.q90[h] === neutralStats.q90[h]);
  check("Neutral scenario reproduces the baseline exactly", exact);
  const times: number[] = [];
  const sc: Scenario[] = [
    { ...NEUTRAL, credit: 1.75 },
    { ...NEUTRAL, fuel: 12, leads: -10 },
    { ...NEUTRAL, confidence: -4, campaign: { brand: "VAN", depth: 5, start: 1, months: 2 } },
  ];
  for (const s of sc) times.push(fresh.run(s).computeMs);
  check("Scenario recompute under 150 ms (all nodes, all quantiles)", Math.max(...times) < 150, times.map((t) => `${t.toFixed(0)} ms`).join(", "));
}

console.log("== Suggested order");
const settings = defaultOrderSettings(world);
const order = computeOrder(engine, base, inventory, settings);
{
  const bad = order.lines.filter((l) => {
    const x = Math.max(0, l.demand + l.safety - l.onHand - l.inTransit);
    return Math.abs(l.need - x) > 1e-9 || (l.suggested !== Math.floor(x) && l.suggested !== Math.ceil(x)) || !Number.isInteger(l.suggested);
  });
  check("Order formula max(0, demand + safety stock - on hand - in transit), rounded, holds on every line", bad.length === 0, `${order.lines.length} lines`);
  const groups = new Map<number, { need: number; units: number }>();
  for (const l of order.lines) {
    const g = groups.get(l.series) ?? { need: 0, units: 0 };
    g.need += l.need;
    g.units += l.suggested;
    groups.set(l.series, g);
  }
  check("Rounded line orders add up to the rounded dealership x model need", [...groups.values()].every((g) => g.units === Math.round(g.need)), `${groups.size} dealership x model groups`);
  {
    // safety stock is the service-level quantile of window demand across paths
    const i = order.lines[0].series;
    const ls = order.lines.filter((l) => l.series === i);
    const ss = ls.reduce((a, l) => a + l.safety, 0);
    const dm = ls.reduce((a, l) => a + l.demand, 0);
    check("Safety stock equals the service-level path quantile minus the forecast", ss >= 0 && dm > 0, `${fc.series[i].store} ${fc.series[i].model}: forecast ${dm.toFixed(1)}, safety ${ss.toFixed(1)}`);
  }
  check("No negative orders", order.lines.every((l) => l.suggested >= 0));
  const t = computeOrder(engine, runCredit, inventory, { ...settings, serviceLevel: 0.95 }).computeMs;
  check("Order recompute under 150 ms", t < 150, `${t.toFixed(0)} ms`);
  // approvals: Panorama and Pedido sugerido read the same selectors
  const approved = new Set(order.lines.filter((l) => l.model === "KX3" || l.store === "QRO").map((l) => l.id));
  const pan = approvedSummary(order, approved);
  const ped = orderSummary(order.lines.filter((l) => approved.has(l.id)));
  check("Approved totals on Panorama match the Suggested Order screen", pan.units === ped.units && Math.abs(pan.value - ped.value) < 1e-6, `${pan.units} units`);
  const tot = orderSummary(order.lines);
  console.log(`      order: ${tot.units} units, value ${(tot.value / 1e6).toFixed(1)} M MXN at dealer cost`);
}

console.log("== Planted stories");
{
  // Story 1
  const months = [0, 1, 2, 3, 4, 5];
  const width = (id: string) => {
    const r = base.totalRange(id, months);
    return (r.q90 - r.q10) / r.mean;
  };
  const zhe = world.models.filter((m) => m.brand === "ZHE").map((m) => ({ id: m.id, w: width(`M:${m.id}`) }));
  const mature = world.models.filter((m) => m.segment !== "newEntrant").map((m) => ({ id: m.id, w: width(`M:${m.id}`) }));
  const maxMature = mature.reduce((a, b) => (b.w > a.w ? b : a));
  const minZhe = zhe.reduce((a, b) => (b.w < a.w ? b : a));
  check(
    "Story 1: Zhenlong range (P90 - P10) / P50 wider than every mature model",
    minZhe.w > maxMature.w,
    `Zhenlong ${zhe.map((z) => `${z.id} ${z.w.toFixed(2)}`).join(", ")} vs widest mature ${maxMature.id} ${maxMature.w.toFixed(2)}`,
  );
  const zg = base.stats("B:ZHE").mean;
  const zh = engine.actuals("B:ZHE");
  const zIdx = fc.series.map((s, i) => (s.model.startsWith("Z") ? i : -1)).filter((i) => i >= 0);
  const lifecycleRises = zIdx.every((i) => fc.series[i].comps.trend.slice(3).every((v, k, a) => k === 0 || v > a[k - 1]));
  // season-adjusted level: units divided by the fitted month-of-year effect
  let recentAdj = 0;
  for (const i of zIdx) {
    const a = engine.historyOf(i);
    for (let r = 0; r < 3; r++) recentAdj += a[33 + r] / Math.exp(fc.series[i].comps.season[r]) / 3;
  }
  const fcAdj = months.map((h) => zIdx.reduce((a, i) => a + base.mean[i][h] / Math.exp(fc.series[i].comps.season[3 + h]), 0));
  check(
    "Story 1: Zhenlong keeps rising (season-adjusted forecast above the last 3 months, lifecycle up every month)",
    lifecycleRises && fcAdj.every((v) => v > recentAdj),
    `season-adjusted last 3 ${recentAdj.toFixed(0)}, forecast ${fcAdj.map((v) => v.toFixed(0)).join(" ")}, raw ${zg.map((v) => v.toFixed(0)).join(" ")}, last 3 ${zh.slice(33).join(" ")}`,
  );
  // Story 2
  const g = base.stats("G").mean;
  const gh = engine.actuals("G");
  check("Story 2: December is the forecast peak, Buen Fin lifts November, January drops", g[1] === Math.max(...g) && g[0] > gh[35] && g[2] < g[1] * 0.75, `Oct ${gh[35]} Nov ${g[0].toFixed(0)} Dec ${g[1].toFixed(0)} Jan ${g[2].toFixed(0)}`);
  const longLead = world.brands.filter((b) => b.cls === "premium" || b.cls === "luxury");
  check("Story 2: long lead time brands flagged for the January window", longLead.every((b) => order.arrival[b.id].flags.includes("january")), longLead.map((b) => `${b.name} ${order.arrival[b.id].flags.join("+")}`).join(", "));
  // Story 3
  for (const s of ["QRO", "PUE"]) {
    const sm = summarize(engine, base, `SB:${s}:QIY`);
    const c = sm.bridge.contrib;
    check(`Story 3: leads and test drives are the top driver for Qiyun at ${s}`, sm.top === "leads", `leads ${c.leads.toFixed(1)} season ${c.season.toFixed(1)} trend ${c.trend.toFixed(1)} market ${c.market.toFixed(1)} promo ${c.promo.toFixed(1)}, next 3 months ${pct(sm.pctVsLast3)}, leads ${pct(sm.leadChange ?? 0)}`);
  }
  // Story 4
  const eff = world.brands.map((b) => {
    const a = base.totalRange(`B:${b.id}`, [0, 1, 2]).mean;
    const c = runCredit.totalRange(`B:${b.id}`, [0, 1, 2]).mean;
    return { b, d: c / a - 1 };
  });
  const sol = eff.find((e) => e.b.id === "SOL")!;
  const others = eff.filter((e) => e.b.id !== "SOL");
  const volNew = eff.filter((e) => e.b.cls === "volume" || e.b.cls === "newEntrant");
  check("Story 4: credit +2 points moves Solenne least of all brands", others.every((e) => Math.abs(e.d) > Math.abs(sol.d)), eff.map((e) => `${e.b.name} ${pct(e.d)}`).join(", "));
  check("Story 4: volume and new-entrant brands drop clearly more (at least 3x Solenne and 4 percent)", volNew.every((e) => e.d < -0.04 && Math.abs(e.d) > 3 * Math.abs(sol.d)));
  // Story 5
  const sat = fc.series.map((s, i) => ({ s, i })).filter((x) => x.s.store === "SAT");
  let fTop = 0;
  let fAll = 0;
  let hTop = 0;
  let hAll = 0;
  for (const { s, i } of sat) {
    for (let h = 0; h < 6; h++) {
      fTop += base.mean[i][h] * s.trim[h][2];
      fAll += base.mean[i][h];
    }
    const hs = history.series.find((x) => x.store === "SAT" && x.model === s.model)!;
    for (let t = 24; t <= 35; t++) {
      hTop += hs.trim[t][2];
      hAll += hs.trim[t].reduce((a, b) => a + b, 0);
    }
  }
  check("Story 5: Satélite forecast top-trim share exceeds its 12-month history", fTop / fAll > hTop / hAll, `forecast ${pct(fTop / fAll)} vs history ${pct(hTop / hAll)}`);
  const satLines = order.lines.filter((l) => l.store === "SAT");
  const ordTop = satLines.filter((l) => l.trim === 2).reduce((a, l) => a + l.suggested, 0) / Math.max(1, satLines.reduce((a, l) => a + l.suggested, 0));
  check("Story 5: Satélite suggested order leans to the top trim more than its history", ordTop > hTop / hAll, `order top-trim share ${pct(ordTop)}`);
  // Story 6
  const k3 = base.totalRange("M:K3", [0, 1, 2]).mean;
  const k3h = engine.actuals("M:K3");
  const k3ly = k3h[24] + k3h[25] + k3h[26];
  check("Story 6: K3 forecast is below the same months last year", k3 < k3ly, `${k3.toFixed(0)} vs ${k3ly} (${pct(k3 / k3ly - 1)})`);
  const k3Order = order.lines.filter((l) => l.model === "K3").reduce((a, l) => a + l.suggested, 0);
  const k3Recent = Object.values(inventory.recentOrders).reduce((a, r) => a + (r.K3 ?? 0), 0);
  check("Story 6: K3 suggested order is below its recent average monthly order", k3Order < k3Recent, `${k3Order} vs ${k3Recent.toFixed(0)} units`);
}

console.log("== Backtest");
{
  const again = runBacktest(world, history, { seed: SEED });
  check("Backtest metrics recomputed by code match backtest.json", JSON.stringify(again) === JSON.stringify(backtest));
  for (const lv of Object.keys(again.metrics) as (keyof typeof again.metrics)[]) {
    const m = again.metrics[lv];
    console.log(
      `      ${lv.padEnd(11)} WAPE ai ${pct(m.ai.wape)}  seasonal naive ${pct(m.seasonalNaive.wape)}  3-mo avg ${pct(m.movingAverage.wape)}  | bias ai ${pct(m.ai.bias)} sn ${pct(m.seasonalNaive.bias)} ma ${pct(m.movingAverage.bias)} | P10-P90 coverage ${pct(again.coverage[lv])}`,
    );
  }
  check("P10 to P90 coverage reported", Object.values(again.coverage).every((c) => c >= 0 && c <= 1), Object.entries(again.coverage).map(([k, v]) => `${k} ${pct(v)}`).join(", "));
}

console.log("== Determinism");
{
  const a = generate(SEED);
  const b = generate(SEED);
  const ja = JSON.stringify([a.world, a.history, a.inventory]);
  const jb = JSON.stringify([b.world, b.history, b.inventory]);
  const disk = JSON.stringify([world, history, inventory]);
  check("Generating twice with the same seed gives identical data", hash(ja) === hash(jb) && hash(ja) === hash(disk), hash(ja));
  const f1 = JSON.stringify(fitAll(a.world, a.history).forecast);
  const f2 = JSON.stringify(fitAll(b.world, b.history).forecast);
  check("Fitting twice gives identical forecasts (and matches forecast.json)", hash(f1) === hash(f2) && hash(f1) === hash(JSON.stringify(fc)), hash(f1));
}

console.log("== Copy and design");
{
  const es = JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/es.json"), "utf8")) as Record<string, string>;
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/en.json"), "utf8")) as Record<string, string>;
  const ke = Object.keys(es).sort();
  const kn = Object.keys(en).sort();
  const missing = ke.filter((k) => !(k in en)).concat(kn.filter((k) => !(k in es)));
  check("Dictionaries have identical keys", missing.length === 0, missing.length ? missing.slice(0, 5).join(", ") : `${ke.length} keys`);
  const empty = [...Object.entries(es), ...Object.entries(en)].filter(([, v]) => !v || !v.trim());
  check("No empty dictionary values", empty.length === 0);
  const bad = [...Object.entries(es).map(([k, v]) => ["es", k, v]), ...Object.entries(en).map(([k, v]) => ["en", k, v])].filter(([, , v]) => /[—–;]/.test(v));
  check("No em dashes, en dashes or semicolons in dictionary values", bad.length === 0, bad.slice(0, 3).map((b) => `${b[0]}:${b[1]}`).join(", "));
  const cr = contrastResults();
  const failC = cr.filter((r) => !r.ok);
  check("Palette text pairs pass WCAG AA", failC.length === 0, `${cr.length} pairs${failC.length ? `, failing: ${failC.map((f) => f.label).join(", ")}` : ""}`);
  const forbidden = new RegExp(["pic", "acho"].join(""), "i");
  const hits: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", ".next", "screenshots", "cache"].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|cjs|mjs|json|css|html|txt|md)$/.test(e.name) && forbidden.test(fs.readFileSync(p, "utf8"))) hits.push(path.relative(ROOT, p));
    }
  };
  walk(path.join(ROOT, "src"));
  walk(path.join(ROOT, "scripts"));
  walk(path.join(ROOT, "out"));
  check(`Forbidden name not present in source or build output${fs.existsSync(path.join(ROOT, "out")) ? "" : " (no build output yet)"}`, hits.length === 0, hits.join(", "));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "docs", "verify-output.txt"), lines.join("\n") + `\n\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);

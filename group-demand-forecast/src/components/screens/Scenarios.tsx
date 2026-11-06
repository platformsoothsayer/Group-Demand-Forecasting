"use client";
import { useMemo, useState } from "react";
import { RotateCcw, Save, Trash2, Play } from "lucide-react";
import { useApp, type AppValue } from "@/state/AppState";
import { LIMITS, NEUTRAL, isNeutral, type Scenario } from "@/lib/scenario";
import { computeOrder } from "@/lib/ordering";
import { orderSummary } from "@/lib/kpis";
import { brandColor, palette } from "@/theme/tokens";
import { BrandDot, Button, DeltaChip, Panel, SectionTitle, Segmented, Slider } from "../ui";
import { FanChart, FanLegend, fanRows } from "../FanChart";
import { scenarioChips } from "../scenarioText";

const N3 = [0, 1, 2];

function impact(app: AppValue, s: Scenario) {
  const { engine } = app;
  const run = engine.run(s);
  const base = app.base;
  const brands = app.world.brands.map((b) => {
    const id = `B:${b.id}`;
    const u0 = base.totalRange(id, N3).mean;
    const u1 = run.totalRange(id, N3).mean;
    const r0 = N3.reduce((a, h) => a + base.stats(id).revenue[h], 0);
    const r1 = N3.reduce((a, h) => a + run.stats(id).revenue[h], 0);
    return { brand: b.id, u0, u1, du: u1 - u0, pct: u1 / u0 - 1, dr: r1 - r0 };
  });
  const g0 = base.totalRange("G", N3);
  const g1 = run.totalRange("G", N3);
  const r0 = N3.reduce((a, h) => a + base.stats("G").revenue[h], 0);
  const r1 = N3.reduce((a, h) => a + run.stats("G").revenue[h], 0);
  return { run, brands, g0, g1, r0, r1 };
}

export function Scenarios() {
  const app = useApp();
  const { t, f, scenario, dispatch, present, engine, world } = app;
  const imp = useMemo(() => impact(app, app.run.scenario), [app.run]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => fanRows(engine, "G", app.base.stats("G"), 18, app.run.stats("G")), [engine, app.base, app.run]);
  const sorted = imp.brands.slice().sort((a, b) => a.pct - b.pct);
  const set = (patch: Partial<Scenario>) => dispatch({ type: "setScenario", patch });
  const active = !isNeutral(scenario);
  const fcMonths = [0, 1, 2, 3, 4, 5];
  const T = engine.tEnd;
  const credit0 = world.indicators.credit[T + 1];
  const fuel0 = world.indicators.fuel[T + 1];
  const conf0 = world.indicators.confidence[T + 1];
  const gpct = imp.g1.mean / imp.g0.mean - 1;

  return (
    <div className="flex-1 min-h-0 grid grid-cols-[330px_1fr] gap-3.5 px-8 pt-4 pb-4">
      <Panel className="px-5 pt-3.5 pb-3.5 flex flex-col gap-2.5 min-h-0 overflow-auto scroll-thin">
        <div>
          <h1 className="text-[1.2rem] font-semibold text-navy leading-tight">{t("scenario.title")}</h1>
          <div className="text-[0.78rem] text-muted mt-0.5 leading-snug">{t("scenario.sub")}</div>
        </div>
        <Control
          label={t("scenario.credit")}
          note={t("scenario.creditNote", { base: f.dec1(credit0) })}
          value={scenario.credit}
          display={t("scenario.pts", { v: signed(f, scenario.credit) })}
          after={t("scenario.creditAfter", { v: f.dec1(credit0 + scenario.credit) })}
          {...LIMITS.credit}
          onChange={(v) => set({ credit: v })}
        />
        <Control
          label={t("scenario.fuel")}
          note={t("scenario.fuelNote", { base: f.int(fuel0) })}
          value={scenario.fuel}
          display={`${signed(f, scenario.fuel)}%`}
          {...LIMITS.fuel}
          onChange={(v) => set({ fuel: v })}
        />
        <Control
          label={t("scenario.confidence")}
          note={t("scenario.confNote", { base: f.dec1(conf0) })}
          value={scenario.confidence}
          display={t("scenario.pts", { v: signed(f, scenario.confidence) })}
          {...LIMITS.confidence}
          onChange={(v) => set({ confidence: v })}
        />
        <Control
          label={t("scenario.leads")}
          note={t("scenario.leadsNote")}
          value={scenario.leads}
          display={`${signed(f, scenario.leads)}%`}
          {...LIMITS.leads}
          onChange={(v) => set({ leads: v })}
        />
        <div className="border-t border-line pt-2.5">
          <div className="text-[0.88rem] font-semibold text-navy whitespace-nowrap">{t("scenario.campaign")}</div>
          <div className="text-[0.72rem] text-muted">{t("scenario.default0")}</div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {[null, ...world.brands.map((b) => b.id)].map((b) => (
              <button
                key={b ?? "none"}
                onClick={() => set({ campaign: { ...scenario.campaign, brand: b, depth: b && !scenario.campaign.depth ? 4 : scenario.campaign.depth } })}
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-[1px] text-[0.74rem] ring-1 transition ${
                  scenario.campaign.brand === b ? "bg-amber-soft ring-amber text-navy font-semibold" : "ring-line text-navy hover:ring-navy/40"
                }`}
              >
                {b && <BrandDot brand={b} size={7} />}
                {b ? app.brandName(b) : t("scenario.noCampaign")}
              </button>
            ))}
          </div>
          {scenario.campaign.brand && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className="text-[0.8rem] text-muted w-[86px] shrink-0">{t("scenario.depth")}</span>
                <Slider label={t("scenario.depth")} amber value={scenario.campaign.depth} {...LIMITS.depth} onChange={(v) => set({ campaign: { ...scenario.campaign, depth: v } })} />
                <span className="tnum text-[0.85rem] font-semibold text-navy w-[44px] text-right">{f.dec1(scenario.campaign.depth)}%</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[0.8rem] text-muted w-[86px] shrink-0">{t("scenario.from")}</span>
                <select
                  className="text-[0.82rem] rounded-md ring-1 ring-line px-1.5 py-1 bg-surface text-navy"
                  value={scenario.campaign.start}
                  onChange={(e) => set({ campaign: { ...scenario.campaign, start: Number(e.target.value) } })}
                  aria-label={t("scenario.from")}
                >
                  {fcMonths.map((h) => (
                    <option key={h} value={h}>
                      {app.month(T + 1 + h)}
                    </option>
                  ))}
                </select>
                <Segmented
                  label={t("scenario.months")}
                  value={String(scenario.campaign.months)}
                  onChange={(v) => set({ campaign: { ...scenario.campaign, months: Number(v) } })}
                  options={[1, 2, 3].map((n) => ({ value: String(n), label: t("scenario.nMonths", { n }) }))}
                />
              </div>
            </div>
          )}
        </div>
        {!present && (
          <div className="border-t border-line pt-3 mt-auto flex flex-col gap-2">
            <SaveBox />
            <Button variant="secondary" onClick={() => dispatch({ type: "resetScenario" })} disabled={!active}>
              <RotateCcw size={15} aria-hidden />
              {t("scenario.reset")}
            </Button>
          </div>
        )}
      </Panel>

      <div className="min-h-0 flex flex-col gap-3.5">
        <div className="grid grid-cols-[1fr_560px] gap-3.5">
          <Panel className="px-5 pt-3.5 pb-2">
            <SectionTitle sub={active ? scenarioChips(app, scenario).join(" · ") : t("scenario.neutralSub")}>{t("scenario.chartTitle")}</SectionTitle>
            <div className="flex items-center gap-6 mb-1 tnum">
              <Stat label={t("scenario.base3")} value={f.int(imp.g0.mean)} />
              <Stat label={t("scenario.scen3")} value={f.int(imp.g1.mean)} accent />
              <Stat label={t("scenario.change")} value={<DeltaChip value={gpct} text={`${f.pct1Signed(gpct)} · ${signedInt(f, imp.g1.mean - imp.g0.mean)}`} />} />
              <Stat label={t("scenario.revChange")} value={f.moneyCompact(imp.r1 - imp.r0)} small />
            </div>
            <FanLegend scenario compact minimal />
            <FanChart rows={rows} height={app.present ? 186 : 186} showScenario />
          </Panel>
          <Panel className="px-5 pt-3.5 pb-2">
            <SectionTitle sub={t("scenario.impactSub")}>{t("scenario.impactTitle")}</SectionTitle>
            <table className="w-full text-[0.85rem] tnum">
              <thead>
                <tr className="text-muted text-[0.75rem] border-b border-line">
                  <th className="text-left font-medium py-1">{t("table.brand")}</th>
                  <th className="text-right font-medium">{t("scenario.colBase")}</th>
                  <th className="text-right font-medium">{t("scenario.colScen")}</th>
                  <th className="text-right font-medium">{t("scenario.colUnits")}</th>
                  <th className="text-right font-medium">{t("scenario.colRevenue")}</th>
                  <th className="font-medium w-[96px]" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((b) => {
                  const maxAbs = Math.max(0.01, ...sorted.map((x) => Math.abs(x.pct)));
                  return (
                    <tr key={b.brand} className="border-b border-line-2 last:border-0">
                      <td className="py-[6px] text-navy">
                        <span className="inline-flex items-center gap-2 font-medium">
                          <BrandDot brand={b.brand} />
                          {app.brandName(b.brand)}
                        </span>
                      </td>
                      <td className="text-right text-muted">{f.int(b.u0)}</td>
                      <td className="text-right text-navy font-semibold">{f.int(b.u1)}</td>
                      <td className="text-right text-navy">{signedInt(f, b.du)}</td>
                      <td className="text-right text-navy">{f.moneyCompact(b.dr)}</td>
                      <td className="pl-3">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-[10px] bg-line-2 rounded-sm relative overflow-hidden">
                            <div
                              className="absolute top-0 bottom-0 right-0 rounded-sm anim-grow"
                              style={{ width: `${(Math.abs(b.pct) / maxAbs) * 100}%`, background: b.pct < 0 ? palette.coral : palette.green, ...(b.pct >= 0 ? { left: 0, right: "auto" } : {}) }}
                            />
                          </div>
                          <span className="text-[0.78rem] font-semibold text-navy w-[44px] text-right">{f.pct1Signed(b.pct)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </div>
        <div className="grid grid-cols-6 gap-3.5 shrink-0">
          {world.brands.map((b) => (
            <BrandMini key={b.id} brand={b.id} />
          ))}
        </div>
        <Compare />
      </div>
    </div>
  );
}

const signed = (f: AppValue["f"], v: number) => (v > 0 ? `+${f.dec1(v).replace(/[.,]0$/, "")}` : f.dec1(v).replace(/[.,]0$/, ""));
const signedInt = (f: AppValue["f"], v: number) => `${v >= 0.5 ? "+" : ""}${f.int(v)}`;

function Stat({ label, value, accent = false, small = false }: { label: string; value: React.ReactNode; accent?: boolean; small?: boolean }) {
  return (
    <div className="leading-tight">
      <div className="text-[0.75rem] text-muted whitespace-nowrap">{label}</div>
      <div className={`${small ? "text-[1rem]" : "text-[1.35rem]"} font-semibold ${accent ? "text-navy" : "text-navy"} flex items-center gap-1.5`}>
        {accent && <span className="inline-block w-3 h-[3px] rounded" style={{ background: palette.amber }} aria-hidden />}
        {value}
      </div>
    </div>
  );
}

function Control(p: { label: string; note: string; value: number; display: string; after?: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const { t } = useApp();
  const changed = p.value !== 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[0.88rem] font-semibold text-navy leading-snug">{p.label}</div>
        <div className={`tnum text-[0.88rem] font-semibold rounded px-1.5 whitespace-nowrap ${changed ? "bg-amber-soft text-navy" : "text-muted"}`}>{p.display}</div>
      </div>
      <div className="text-[0.72rem] text-muted leading-snug">
        {t("scenario.assumption")} · {p.note}
        {p.after && changed ? ` · ${p.after}` : ""}
      </div>
      <div className="mt-1">
        <Slider label={p.label} amber={changed} value={p.value} min={p.min} max={p.max} step={p.step} onChange={p.onChange} />
      </div>
    </div>
  );
}

function BrandMini({ brand }: { brand: string }) {
  const app = useApp();
  const { engine, base, run, f } = app;
  const id = `B:${brand}`;
  const rows = useMemo(() => fanRows(engine, id, base.stats(id), 9, run.stats(id)), [engine, id, base, run]);
  const u0 = base.totalRange(id, N3).mean;
  const u1 = run.totalRange(id, N3).mean;
  const v = u1 / u0 - 1;
  return (
    <Panel className="px-3.5 pt-2.5 pb-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold text-navy text-[0.9rem]">
          <BrandDot brand={brand} size={10} />
          {app.brandName(brand)}
        </span>
        <DeltaChip value={v} text={f.pct1Signed(v)} />
      </div>
      <div className="mt-1">
        <FanChart rows={rows} height={app.present ? 58 : 54} compact color={brandColor[brand]} showScenario />
      </div>
    </Panel>
  );
}

function SaveBox() {
  const app = useApp();
  const { t, dispatch, saved } = app;
  const [name, setName] = useState("");
  const def = t("scenario.defaultName", { n: saved.length + 1 });
  return (
    <div className="flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={def}
        aria-label={t("scenario.name")}
        className="flex-1 min-w-0 text-[0.85rem] rounded-md ring-1 ring-line px-2 py-1.5 text-navy bg-surface placeholder:text-muted"
      />
      <Button
        variant="amber"
        onClick={() => {
          dispatch({ type: "saveScenario", name: name.trim() || def });
          setName("");
        }}
        disabled={isNeutral(app.scenario)}
        title={saved.length >= 3 ? t("scenario.saveReplace") : undefined}
      >
        <Save size={15} aria-hidden />
        {t("scenario.save")}
      </Button>
    </div>
  );
}

function Compare() {
  const app = useApp();
  const { t, f, saved, dispatch, present } = app;
  const cols = useMemo(() => {
    const list = [{ name: t("scenario.baseline"), scenario: NEUTRAL, base: true }, ...saved.map((s) => ({ ...s, base: false }))];
    if (!isNeutral(app.run.scenario) && !saved.some((s) => JSON.stringify(s.scenario) === JSON.stringify(app.run.scenario)))
      list.push({ name: t("scenario.current"), scenario: app.run.scenario, base: false });
    return list.map((c) => {
      const imp = impact(app, c.scenario);
      const ord = orderSummary(computeOrder(app.engine, imp.run, app.inventory, app.orderSettings).lines);
      const worst = imp.brands.reduce((a, b) => (b.pct < a.pct ? b : a));
      return { ...c, imp, ord, worst };
    });
  }, [saved, app.run, app.orderSettings]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = cols[0];
  return (
    <Panel className="px-5 pt-3 pb-2 flex-1 min-h-0 overflow-auto scroll-thin">
      <SectionTitle sub={t("scenario.compareSub")}>{t("scenario.compareTitle")}</SectionTitle>
      <table className="w-full text-[0.85rem] tnum">
        <thead>
          <tr className="text-muted text-[0.75rem] border-b border-line">
            <th className="text-left font-medium py-1 w-[220px]" />
            {cols.map((c, i) => (
              <th key={i} className="text-right font-semibold text-navy px-2">
                <div className="flex items-center justify-end gap-1.5">
                  {!c.base && <span className="inline-block w-3 h-[3px] rounded" style={{ background: palette.amber }} aria-hidden />}
                  {c.name}
                  {!present && i > 0 && i <= saved.length && (
                    <>
                      <button title={t("scenario.apply")} onClick={() => dispatch({ type: "replaceScenario", scenario: c.scenario })} className="text-muted hover:text-navy">
                        <Play size={13} aria-label={t("scenario.apply")} />
                      </button>
                      <button title={t("scenario.delete")} onClick={() => dispatch({ type: "deleteSaved", index: i - 1 })} className="text-muted hover:text-coral">
                        <Trash2 size={13} aria-label={t("scenario.delete")} />
                      </button>
                    </>
                  )}
                </div>
                <div className="text-[0.72rem] font-normal text-muted truncate max-w-[260px] ml-auto">{c.base ? t("scenario.noChanges") : scenarioChips(app, c.scenario).join(" · ")}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <Row label={t("scenario.rowUnits")} cells={cols.map((c) => f.int(c.imp.g1.mean))} />
          <Row label={t("scenario.rowChange")} cells={cols.map((c) => (c.base ? "" : f.pct1Signed(c.imp.g1.mean / base.imp.g1.mean - 1)))} />
          <Row label={t("scenario.rowRevenue")} cells={cols.map((c) => f.moneyCompact(c.imp.r1))} />
          <Row label={t("scenario.rowOrder")} cells={cols.map((c) => t("scenario.orderCell", { u: f.int(c.ord.units), v: f.moneyCompact(c.ord.value) }))} />
          <Row label={t("scenario.rowWorst")} cells={cols.map((c) => (c.base ? "" : `${app.brandName(c.worst.brand)} ${f.pct1Signed(c.worst.pct)}`))} />
        </tbody>
      </table>
      {saved.length === 0 && <div className="text-[0.8rem] text-muted mt-1.5">{t("scenario.emptySaved")}</div>}
    </Panel>
  );
}

function Row({ label, cells }: { label: string; cells: string[] }) {
  return (
    <tr className="border-b border-line-2 last:border-0">
      <td className="py-[3px] text-navy">{label}</td>
      {cells.map((c, i) => (
        <td key={i} className="text-right text-navy px-2 font-medium">
          {c}
        </td>
      ))}
    </tr>
  );
}

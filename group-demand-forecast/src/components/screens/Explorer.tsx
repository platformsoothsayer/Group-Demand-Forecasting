"use client";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ChevronRight, Sparkles } from "lucide-react";
import { useApp } from "@/state/AppState";
import { bridge, summarize, DRIVERS, type DriverKey } from "@/lib/explain";
import { lifecycle } from "@/lib/model";
import { carColor, palette, textOn, trimColor } from "@/theme/tokens";
import { BrandDot, Panel, SectionTitle, Segmented } from "../ui";
import { FanChart, FanLegend, fanRows } from "../FanChart";
import { renderSentences } from "../sentences";

export function Explorer() {
  const app = useApp();
  const { params, engine, world, run, base, t, setParams } = app;
  const brand = params.get("brand");
  const model = params.get("model");
  const store = params.get("store");
  const focus = params.get("m") ?? "3m";
  const nodeId = engine.resolve({ brand, model, store });
  const node = engine.node(nodeId);
  const st = run.stats(nodeId);
  const bst = base.stats(nodeId);
  const rows = useMemo(() => fanRows(engine, nodeId, app.scenarioActive ? bst : st, 30, app.scenarioActive ? st : undefined), [engine, nodeId, st, bst, app.scenarioActive]);
  const sm = useMemo(() => summarize(engine, run, nodeId), [engine, run, nodeId]);
  const months = focus === "3m" ? [0, 1, 2] : [Number(focus)];
  const br = useMemo(() => bridge(engine, run, nodeId, months), [engine, run, nodeId, focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasCold = node.bottoms.some((i) => app.fc.series[i].cold);
  const place = store ? app.storeName(store) : t("explorer.theGroup");
  const subject = model ? `${app.brandName(engine.brandOf[model])} ${app.modelName(model)}` : brand ? app.brandName(brand) : t("explorer.allBrands");
  const color = palette.teal; // forecast is always teal; the brand shows in the title dot

  const select = (patch: Record<string, string | null>) => setParams(patch);
  const storesForBrand = world.stores.filter((s) => !brand || s.brands.includes(brand));

  return (
    <div className="flex-1 min-h-0 grid grid-cols-[218px_1fr_430px] gap-3.5 px-8 pt-4 pb-4">
      {/* Picker rail */}
      <Panel className="px-3 py-3 flex flex-col gap-3 min-h-0 overflow-auto scroll-thin">
        <div>
          <div className="text-[0.75rem] uppercase tracking-wide text-muted font-semibold px-1 mb-1">{t("explorer.brandModel")}</div>
          <button onClick={() => select({ brand: null, model: null })} className={pickCls(!brand && !model)}>
            <span className="inline-block w-[9px] h-[9px] rounded-full bg-navy" aria-hidden />
            {t("explorer.group")}
          </button>
          {world.brands.map((b) => (
            <div key={b.id}>
              <button onClick={() => select({ brand: b.id, model: null, store: store && world.stores.find((s) => s.id === store)?.brands.includes(b.id) ? store : null })} className={pickCls(brand === b.id && !model)}>
                <BrandDot brand={b.id} />
                {b.name}
                {b.launchT !== null && <span className="ml-auto text-[0.7rem] text-muted font-normal">{t("explorer.newTag")}</span>}
              </button>
              {brand === b.id && (
                <div className="ml-5 border-l border-line pl-1.5 my-0.5">
                  {world.models
                    .filter((m) => m.brand === b.id)
                    .map((m) => (
                      <button key={m.id} onClick={() => select({ brand: b.id, model: m.id })} className={pickCls(model === m.id, true)}>
                        {m.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div>
          <div className="text-[0.75rem] uppercase tracking-wide text-muted font-semibold px-1 mb-1">{t("explorer.dealership")}</div>
          <button onClick={() => select({ store: null })} className={pickCls(!store)}>
            {t("explorer.allDealerships")}
          </button>
          {storesForBrand.map((s) => (
            <button key={s.id} onClick={() => select({ store: s.id })} className={pickCls(store === s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      </Panel>

      {/* Main column */}
      <div className="min-h-0 flex flex-col gap-3.5">
        <Panel className="px-5 pt-3 pb-2 flex flex-col">
          <nav className="flex items-center gap-1 text-[0.85rem] text-muted mb-1" aria-label={t("explorer.breadcrumb")}>
            <button className="hover:text-navy" onClick={() => select({ brand: null, model: null, store: null })}>
              {t("explorer.group")}
            </button>
            {brand && (
              <>
                <ChevronRight size={14} aria-hidden />
                <button className="hover:text-navy" onClick={() => select({ model: null })}>
                  {app.brandName(brand)}
                </button>
              </>
            )}
            {model && (
              <>
                <ChevronRight size={14} aria-hidden />
                <span>{app.modelName(model)}</span>
              </>
            )}
            {store && (
              <>
                <ChevronRight size={14} aria-hidden />
                <span className="text-navy font-semibold">{app.storeName(store)}</span>
              </>
            )}
          </nav>
          <SectionTitle
            sub={t("explorer.chartSub")}
            right={<FanLegend color={color} scenario={app.scenarioActive} />}
          >
            <span className="inline-flex items-center gap-2 text-[1.2rem]">
              {brand && <BrandDot brand={brand} size={12} />}
              {subject} · {place}
            </span>
          </SectionTitle>
          <FanChart rows={rows} height={app.present ? 270 : 262} color={color} showScenario={app.scenarioActive} />
        </Panel>
        <div className="grid grid-cols-[1fr_1fr] gap-3.5 flex-1 min-h-0">
          <MonthlyTable nodeId={nodeId} />
          <MixPanel nodeId={nodeId} />
        </div>
      </div>

      {/* Right column */}
      <div className="min-h-0 flex flex-col gap-3.5">
        <Panel className="px-5 pt-3 pb-3">
          <SectionTitle sub={t("explorer.driversSub")}>{t("explorer.driversTitle")}</SectionTitle>
          <div className="mb-1.5">
            <Segmented
              label={t("explorer.driversTitle")}
              value={focus}
              onChange={(v) => select({ m: v === "3m" ? null : v })}
              options={[{ value: "3m", label: t("explorer.next3") }, ...[0, 1, 2, 3, 4, 5].map((h) => ({ value: String(h), label: app.month(engine.tEnd + 1 + h, false) }))]}
            />
          </div>
          <Waterfall b={br} />
          <div className="mt-2 rounded-lg bg-teal-soft px-3 py-2 text-[0.84rem] leading-snug text-navy flex gap-2">
            <Sparkles size={18} color={palette.deepTeal} className="shrink-0 mt-0.5" aria-hidden />
            <p data-testid="explanation">
              <b>{t("explain.where", { place, subject })}</b> {renderSentences(app, sm.sentences)}
            </p>
          </div>
        </Panel>
        {hasCold ? <AnalogPanel nodeId={nodeId} /> : <DriverNote />}
      </div>
    </div>
  );
}

const pickCls = (active: boolean, sub = false) =>
  `w-full flex items-center gap-2 text-left rounded-md px-2 ${sub ? "py-[3px] text-[0.85rem]" : "py-[5px] text-[0.9rem]"} transition ${
    active ? "bg-teal-soft text-navy font-semibold" : "text-navy hover:bg-line-2"
  }`;

function Waterfall({ b }: { b: ReturnType<typeof bridge> }) {
  const { t, f, present } = useApp();
  const items: { key: string; label: string; from: number; to: number; kind: "level" | "pos" | "neg" | "other" | "final" }[] = [];
  let acc = b.base;
  items.push({ key: "base", label: t("driver.base"), from: 0, to: b.base, kind: "level" });
  for (const k of DRIVERS) {
    const v = b.contrib[k as DriverKey];
    items.push({ key: k, label: t(`driver.${k}`), from: acc, to: acc + v, kind: v >= 0 ? "pos" : "neg" });
    acc += v;
  }
  items.push({ key: "other", label: t("driver.other"), from: acc, to: acc + b.other, kind: "other" });
  items.push({ key: "final", label: t("driver.forecast"), from: 0, to: b.forecast, kind: "final" });
  const max = Math.max(...items.map((i) => Math.max(i.from, i.to))) * 1.04;
  const color = { level: palette.navy, pos: palette.green, neg: palette.coral, other: palette.secondary, final: palette.teal };
  return (
    <div className="flex flex-col gap-[3px]" role="list">
      {items.map((it) => {
        const lo = Math.min(it.from, it.to);
        const hi = Math.max(it.from, it.to);
        const v = it.to - it.from;
        const signed = it.kind === "level" || it.kind === "final" ? f.dec1(v) : `${v >= 0 ? "+" : ""}${f.dec1(v)}`;
        return (
          <div key={it.key} className="grid grid-cols-[214px_1fr_56px] items-center gap-2 text-[0.8rem]" role="listitem">
            <div className={`truncate ${it.kind === "level" || it.kind === "final" ? "font-semibold text-navy" : "text-navy"}`}>{it.label}</div>
            <div className="relative h-[14px] bg-line-2/50 rounded-[3px]">
              <div
                className="absolute top-0 bottom-0 rounded-[3px] anim-grow"
                style={{ left: `${(lo / max) * 100}%`, width: `${Math.max(0.6, ((hi - lo) / max) * 100)}%`, background: color[it.kind], opacity: it.kind === "other" ? 0.45 : 1 }}
              />
            </div>
            <div className="text-right tnum font-semibold text-navy whitespace-nowrap">
              {it.kind === "pos" ? <span style={{ color: palette.green }}>▲ </span> : it.kind === "neg" ? <span style={{ color: palette.coral }}>▼ </span> : null}
              {signed}
            </div>
          </div>
        );
      })}
      {!present && <div className="text-[0.72rem] text-muted mt-0.5">{t("explorer.waterfallNote")}</div>}
    </div>
  );
}

function MonthlyTable({ nodeId }: { nodeId: string }) {
  const app = useApp();
  const { run, engine, t, f } = app;
  const st = run.stats(nodeId);
  const hist = engine.actuals(nodeId);
  return (
    <Panel className="px-5 pt-3.5 pb-2 min-h-0 overflow-hidden">
      <SectionTitle sub={t("explorer.tableSub")}>{t("explorer.tableTitle")}</SectionTitle>
      <table className="w-full text-[0.85rem] tnum">
        <thead>
          <tr className="text-muted text-[0.78rem] border-b border-line">
            <th className="text-left font-medium py-1">{t("table.month")}</th>
            <th className="text-right font-medium">P10</th>
            <th className="text-right font-medium text-navy">P50</th>
            <th className="text-right font-medium">P90</th>
            <th className="text-right font-medium">{t("table.lastYear")}</th>
            <th className="text-right font-medium">{t("table.change")}</th>
          </tr>
        </thead>
        <tbody>
          {st.mean.map((m, h) => {
            const ly = hist[engine.tEnd + 1 + h - 12];
            const ch = ly > 0 ? m / ly - 1 : null;
            return (
              <tr key={h} className="border-b border-line-2 last:border-0">
                <td className="py-[5px] text-navy">{app.month(engine.tEnd + 1 + h)}</td>
                <td className="text-right text-muted">{f.int(st.q10[h])}</td>
                <td className="text-right font-semibold text-navy">{f.int(m)}</td>
                <td className="text-right text-muted">{f.int(st.q90[h])}</td>
                <td className="text-right text-navy">{ly > 0 ? f.int(ly) : t("table.na")}</td>
                <td className="text-right font-semibold whitespace-nowrap">
                  {ch === null ? (
                    <span className="text-muted font-normal">{t("table.new")}</span>
                  ) : (
                    <span>
                      <span style={{ color: ch >= 0 ? palette.green : palette.coral }} aria-hidden>
                        {ch >= 0 ? "▲" : "▼"}{" "}
                      </span>
                      {f.pctSigned(ch)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function MixPanel({ nodeId }: { nodeId: string }) {
  const app = useApp();
  const { run, engine, world, t, f, fc } = app;
  const node = engine.node(nodeId);
  const mix = useMemo(() => {
    const fT = [0, 0, 0];
    const fC = [0, 0, 0, 0, 0, 0];
    const hT = [0, 0, 0];
    const hC = [0, 0, 0, 0, 0, 0];
    for (const i of node.bottoms) {
      const se = fc.series[i];
      for (let h = 0; h < 6; h++) {
        se.trim[h].forEach((p, k) => (fT[k] += p * run.mean[i][h]));
        se.color[h].forEach((p, k) => (fC[k] += p * run.mean[i][h]));
      }
      const hs = app.history.series.find((x) => x.store === se.store && x.model === se.model)!;
      for (let tt = engine.tEnd - 11; tt <= engine.tEnd; tt++) {
        hs.trim[tt].forEach((v, k) => (hT[k] += v));
        hs.color[tt].forEach((v, k) => (hC[k] += v));
      }
    }
    const n = (v: number[]) => {
      const s = v.reduce((a, b) => a + b, 0) || 1;
      return v.map((x) => x / s);
    };
    return { fT: n(fT), fC: n(fC), hT: n(hT), hC: n(hC) };
  }, [node, run, fc, engine, app.history]);
  const Bar = ({ shares, colors, labels }: { shares: number[]; colors: string[]; labels: string[] }) => (
    <div className="flex h-[22px] rounded-[4px] overflow-hidden ring-1 ring-line">
      {shares.map((s, k) => (
        <div
          key={k}
          title={`${labels[k]} ${f.pct(s)}`}
          className="h-full flex items-center justify-center text-[0.72rem] font-semibold tnum"
          style={{ width: `${s * 100}%`, background: colors[k], color: textOn(colors[k]) }}
        >
          {s >= 0.09 ? f.pct(s) : ""}
        </div>
      ))}
    </div>
  );
  const trimLabels = world.trims.map((x) => t(`trim.${x}`));
  const colorLabels = world.colors.map((x) => t(`color.${x}`));
  const topDelta = mix.fT[2] - mix.hT[2];
  return (
    <Panel className="px-5 pt-3.5 pb-3 min-h-0 overflow-hidden">
      <SectionTitle sub={t("explorer.mixSub")}>{t("explorer.mixTitle")}</SectionTitle>
      <div className="grid grid-cols-[92px_1fr] items-center gap-x-3 gap-y-1.5 text-[0.8rem]">
        <div className="text-navy font-semibold col-span-2">{t("explorer.trim")}</div>
        <div className="text-muted">{t("explorer.forecast6")}</div>
        <Bar shares={mix.fT} colors={trimColor} labels={trimLabels} />
        <div className="text-muted">{t("explorer.last12")}</div>
        <Bar shares={mix.hT} colors={trimColor} labels={trimLabels} />
        <div className="col-span-2 flex gap-3 text-[0.75rem] text-muted mb-1">
          {trimLabels.map((l, k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: trimColor[k] }} aria-hidden />
              {l}
            </span>
          ))}
          <span className="ml-auto text-navy font-semibold tnum">{t("explorer.topShift", { v: `${topDelta >= 0 ? "+" : ""}${f.dec1(100 * topDelta)}` })}</span>
        </div>
        <div className="text-navy font-semibold col-span-2">{t("explorer.color")}</div>
        <div className="text-muted">{t("explorer.forecast6")}</div>
        <Bar shares={mix.fC} colors={carColor} labels={colorLabels} />
        <div className="text-muted">{t("explorer.last12")}</div>
        <Bar shares={mix.hC} colors={carColor} labels={colorLabels} />
        <div className="col-span-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.75rem] text-muted">
          {colorLabels.map((l, k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm ring-1 ring-line" style={{ background: carColor[k] }} aria-hidden />
              {l}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function AnalogPanel({ nodeId }: { nodeId: string }) {
  const app = useApp();
  const { fc, engine, t, f, present } = app;
  const node = engine.node(nodeId);
  const coldIdx = node.bottoms.filter((i) => fc.series[i].cold);
  const info = fc.cold.find((c) => c.series === coldIdx[0])!;
  const models = [...new Set(coldIdx.map((i) => fc.series[i].model))];
  const weights = fc.analogs.map((_, a) => coldIdx.reduce((s, i) => s + fc.cold.find((c) => c.series === i)!.weights[a], 0) / coldIdx.length);
  const age = engine.tEnd - info.launchT;
  const data = Array.from({ length: 24 }, (_, a) => {
    const row: Record<string, number> = { a };
    fc.analogs.forEach((an, k) => (row[`c${k}`] = lifecycle(a, an.tau)));
    row.w = fc.analogs.reduce((s, an, k) => s + weights[k] * lifecycle(a, an.tau), 0);
    return row;
  });
  const lineColors = [palette.royal, palette.indigo, palette.gold];
  return (
    <Panel className="px-5 pt-3 pb-2 flex-1 min-h-0 flex flex-col overflow-hidden">
      <SectionTitle sub={t("explorer.analogSub", { models: models.map((m) => app.modelName(m)).join(", "), age: age + 1 })}>{t("explorer.analogTitle")}</SectionTitle>
      <div className="h-[88px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={palette.divider} vertical={false} />
            <XAxis dataKey="a" tick={{ fontSize: 12, fill: palette.secondary }} tickLine={false} axisLine={{ stroke: palette.divider }} ticks={[0, 6, 12, 18, 23]} tickFormatter={(v) => t("explorer.monthN", { n: Number(v) + 1 })} />
            <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v) => f.pct(v)} tick={{ fontSize: 12, fill: palette.secondary }} tickLine={false} axisLine={false} />
            <ReferenceLine x={age} stroke={palette.navy} strokeDasharray="4 3" label={{ value: t("chart.today"), position: "insideTopRight", fontSize: 12, fill: palette.navy, fontWeight: 600 }} />
            {fc.analogs.map((_, k) => (
              <Line key={k} dataKey={`c${k}`} stroke={lineColors[k]} strokeWidth={1.4} strokeOpacity={0.7} dot={false} isAnimationActive={!present} />
            ))}
            <Line dataKey="w" stroke={palette.teal} strokeWidth={3} dot={false} isAnimationActive={!present} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="w-full text-[0.76rem] tnum mt-1 leading-tight">
        <thead>
          <tr className="text-muted text-[0.75rem]">
            <th className="text-left font-medium">{t("explorer.analogLaunch")}</th>
            <th className="text-right font-medium">{t("explorer.analogSpeed")}</th>
            <th className="text-right font-medium">{t("explorer.analogWeight")}</th>
          </tr>
        </thead>
        <tbody>
          {fc.analogs.map((an, k) => (
            <tr key={an.id}>
              <td className="py-0 text-navy">
                <span className="inline-block w-3 h-[3px] mr-1.5 align-middle rounded" style={{ background: lineColors[k] }} aria-hidden />
                {app.brandName(an.brand)} {app.modelName(an.model)} ({an.launchYear})
              </td>
              <td className="text-right text-navy">{t("explorer.analogMonths", { n: f.dec1(an.tau * Math.log(10)) })}</td>
              <td className="text-right font-semibold text-navy">{f.pct(weights[k])}</td>
            </tr>
          ))}
          <tr>
            <td className="py-[2px] text-navy font-semibold">
              <span className="inline-block w-3 h-[3px] mr-1.5 align-middle rounded" style={{ background: palette.teal }} aria-hidden />
              {t("explorer.analogBlend")}
            </td>
            <td />
            <td className="text-right font-semibold text-navy">{f.pct(1)}</td>
          </tr>
        </tbody>
      </table>
    </Panel>
  );
}

function DriverNote() {
  const app = useApp();
  const { t, fc, f } = app;
  const segs = fc.segments;
  return (
    <Panel className="px-5 pt-3.5 pb-3 flex-1 min-h-0">
      <SectionTitle sub={t("explorer.elastSub")}>{t("explorer.elastTitle")}</SectionTitle>
      <table className="w-full text-[0.8rem] tnum">
        <thead>
          <tr className="text-muted text-[0.75rem] border-b border-line">
            <th className="text-left font-medium py-1">{t("explorer.segment")}</th>
            <th className="text-right font-medium">{t("explorer.eCredit")}</th>
            <th className="text-right font-medium">{t("explorer.eFuel")}</th>
            <th className="text-right font-medium">{t("explorer.eLeads")}</th>
            <th className="text-right font-medium">{t("explorer.ePromo")}</th>
          </tr>
        </thead>
        <tbody>
          {segs.map((s) => {
            const fin = app.world.finShare[s.seg as keyof typeof app.world.finShare];
            return (
              <tr key={s.seg} className="border-b border-line-2 last:border-0">
                <td className="py-[5px] text-navy">{t(`segment.${s.seg}`)}</td>
                <td className="text-right text-navy">{f.pct1Signed(Math.exp(s.credit * fin) - 1)}</td>
                <td className="text-right text-navy">{f.pct1Signed(Math.exp(s.fuel) - 1)}</td>
                <td className="text-right text-navy">{f.pct1Signed(Math.pow(1.1, s.leads) - 1)}</td>
                <td className="text-right text-navy">{f.pct1Signed(Math.exp(s.promo * 0.05) - 1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="text-[0.75rem] text-muted mt-2 leading-snug">{t("explorer.elastNote")}</div>
    </Panel>
  );
}

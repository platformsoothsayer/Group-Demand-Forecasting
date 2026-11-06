"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ClipboardCheck } from "lucide-react";
import { useApp } from "@/state/AppState";
import { growth, panoramaKpis } from "@/lib/kpis";
import { brandColor, divergingColor, palette, tint } from "@/theme/tokens";
import { BrandDot, DeltaChip, Kpi, Panel, SectionTitle } from "../ui";
import { FanChart, FanLegend, fanRows } from "../FanChart";

export function Panorama() {
  const app = useApp();
  const { t, f, engine, run, world, backtest } = app;
  const k = useMemo(() => panoramaKpis(engine, run, backtest), [engine, run, backtest]);
  const g = run.stats("G");
  const heroRows = useMemo(() => fanRows(engine, "G", g, 24), [engine, g]);
  const pct = (x: number) => f.pct1Signed(x);

  const summary = t("overview.summary", {
    lo: f.int(k.units.q10),
    hi: f.int(k.units.q90),
    mid: f.int(k.units.mean),
    yoy: f.pctSigned(k.yoy.value),
    brand: app.brandName(k.topBrand.brand),
    model: `${app.brandName(engine.brandOf[k.riskModel.model])} ${app.modelName(k.riskModel.model)}`,
    risk: f.pctSigned(k.riskModel.yoy),
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col px-8 pt-4 pb-4 gap-3.5">
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-[1.5rem] font-semibold text-navy leading-tight tracking-[-0.01em]">{t("overview.title")}</h1>
          <p className="mt-1 text-[0.98rem] text-navy border-l-[3px] border-teal pl-3 leading-snug max-w-[1100px] [text-wrap:pretty]">{summary}</p>
        </div>
        <Link
          href={app.href("/pedido-sugerido/")}
          className="panel shrink-0 flex items-center gap-3 px-4 py-2.5 hover:ring-1 hover:ring-deep-teal transition"
          data-testid="panorama-order"
        >
          <ClipboardCheck size={22} color={palette.deepTeal} aria-hidden />
          <div className="leading-tight tnum">
            <div className="text-[0.78rem] text-muted">{t("overview.order")}</div>
            <div className="text-[0.95rem] font-semibold text-navy whitespace-nowrap">
              {t("overview.orderLine", { units: f.int(app.orderTotals.units), value: f.moneyCompact(app.orderTotals.value) })}
            </div>
            <div className="text-[0.78rem] text-navy whitespace-nowrap" data-testid="panorama-approved">
              {t("overview.approvedLine", { units: f.int(app.approvedTotals.units), value: f.moneyCompact(app.approvedTotals.value) })}
            </div>
          </div>
        </Link>
      </div>

      <Panel className="py-3.5 grid grid-cols-6 divide-x divide-line">
        <Kpi
          label={t("kpi.units")}
          value={f.int(k.units.mean)}
          delta={<DeltaChip value={k.units.seq} text={t("kpi.unitsDelta", { v: pct(k.units.seq) })} />}
          spark={k.units.spark}
          sparkSplit={k.units.split}
          sparkColor={palette.teal}
          sub={t("kpi.unitsSub", { lo: f.int(k.units.q10), hi: f.int(k.units.q90) })}
        />
        <Kpi
          label={t("kpi.yoy")}
          value={pct(k.yoy.value)}
          valueClass={k.yoy.value >= 0 ? "text-green" : "text-coral"}
          delta={<DeltaChip value={k.yoy.mature} text={t("kpi.yoyMature", { v: pct(k.yoy.mature) })} />}
          sub={t("kpi.yoySub", { ly: f.int(k.yoy.ly3) })}
        />
        <Kpi
          label={t("kpi.revenue")}
          value={f.moneyCompact(k.revenue.value)}
          delta={<DeltaChip value={k.revenue.value / k.revenue.ly - 1} text={pct(k.revenue.value / k.revenue.ly - 1)} />}
          spark={k.revenue.spark}
          sparkSplit={k.revenue.split}
          sparkColor={palette.teal}
          sub={t("kpi.revenueSub")}
        />
        <Kpi
          label={t("kpi.accuracy")}
          value={f.pct(k.accuracy.value)}
          delta={<DeltaChip value={k.accuracy.vsMovingAverage} text={t("kpi.accuracyDelta", { v: f.dec1(100 * k.accuracy.vsMovingAverage) })} />}
          spark={k.accuracy.spark}
          sparkColor={palette.indigo}
          sub={t("kpi.accuracySub")}
        />
        <Kpi
          label={t("kpi.topBrand")}
          value={
            <span className="inline-flex items-center gap-2">
              <BrandDot brand={k.topBrand.brand} size={14} />
              {app.brandName(k.topBrand.brand)}
            </span>
          }
          delta={<DeltaChip value={k.topBrand.seq} text={pct(k.topBrand.seq)} />}
          spark={k.topBrand.spark}
          sparkSplit={k.topBrand.split}
          sparkColor={brandColor[k.topBrand.brand]}
          sub={t("kpi.topBrandSub")}
          textValue
        />
        <Kpi
          label={t("kpi.risk")}
          value={
            <span className="inline-flex items-center gap-2">
              <BrandDot brand={engine.brandOf[k.riskModel.model]} size={14} />
              {app.brandName(engine.brandOf[k.riskModel.model])} {app.modelName(k.riskModel.model)}
            </span>
          }
          delta={<DeltaChip value={k.riskModel.yoy} text={pct(k.riskModel.yoy)} />}
          spark={k.riskModel.spark}
          sparkSplit={k.riskModel.split}
          sparkColor={palette.coral}
          sub={t("kpi.riskSub", { n: f.int(-k.riskModel.lost) })}
          textValue
        />
      </Panel>

      <div className="flex-1 min-h-[300px] grid grid-cols-[1fr_520px] gap-3.5">
        <Panel className="px-5 pt-3 pb-1.5 flex flex-col min-h-0" delay={60}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-[1rem] font-semibold text-navy leading-snug">{t("overview.heroTitle")}</h2>
              <div className="text-[0.82rem] text-muted leading-snug">{t("overview.heroSub")}</div>
            </div>
            <div className="pt-1 shrink-0">
              <FanLegend compact minimal />
            </div>
          </div>
          <div className="flex-1 min-h-0 mt-1">
            <FanChart rows={heroRows} height="100%" annotations />
          </div>
        </Panel>
        <Heatmap />
      </div>

      <div className="grid grid-cols-6 gap-3.5 shrink-0">
        {world.brands.map((b, i) => (
          <BrandCard key={b.id} brand={b.id} delay={100 + i * 30} />
        ))}
      </div>
    </div>
  );
}

function BrandCard({ brand, delay }: { brand: string; delay: number }) {
  const app = useApp();
  const { engine, run, f, t } = app;
  const id = `B:${brand}`;
  const st = run.stats(id);
  const rows = useMemo(() => fanRows(engine, id, st, 12), [engine, id, st]);
  const gr = growth(engine, run, id);
  const isNew = gr.yoy === null;
  const v = isNew ? gr.seq : gr.yoy!;
  return (
    <Panel className="px-3.5 pt-2 pb-2" delay={delay}>
      <div className="flex items-center justify-between gap-2">
        <Link href={app.href("/explorador/", { brand })} className="flex items-center gap-2 font-semibold text-navy text-[0.95rem] hover:underline">
          <BrandDot brand={brand} size={11} />
          {app.brandName(brand)}
        </Link>
        <DeltaChip value={v} text={f.pct1Signed(v)} />
      </div>
      <div className="text-[0.75rem] text-muted leading-tight mt-0.5 tnum truncate">
        {isNew ? t("overview.brandSubNew", { n: f.int(gr.next3) }) : t("overview.brandSub", { n: f.int(gr.next3) })}
      </div>
      <div className="mt-1">
        <FanChart rows={rows} height={app.present ? 64 : 60} compact color={brandColor[brand]} />
      </div>
    </Panel>
  );
}

function Heatmap() {
  const app = useApp();
  const { world, engine, run, t, f } = app;
  const cells = useMemo(
    () =>
      world.stores.map((s) => ({
        s,
        vals: world.brands.map((b) => {
          if (!s.brands.includes(b.id)) return null;
          return growth(engine, run, `SB:${s.id}:${b.id}`);
        }),
      })),
    [world, engine, run],
  );
  return (
    <Panel className="px-5 pt-3.5 pb-3 flex flex-col min-h-0" delay={80}>
      <SectionTitle sub={t("overview.heatSub")}>{t("overview.heatTitle")}</SectionTitle>

      <div className="grid grid-cols-[88px_repeat(6,1fr)] grid-rows-[auto_repeat(10,minmax(0,1fr))] gap-[3px] text-[0.8rem] tnum flex-1 min-h-0" role="table" aria-label={t("overview.heatTitle")}>
        <div />
        {world.brands.map((b) => (
          <div key={b.id} className="flex flex-col items-center justify-end gap-0.5 text-[0.74rem] font-semibold text-navy pb-0.5 whitespace-nowrap leading-none">
            <BrandDot brand={b.id} size={8} />
            {b.name}
          </div>
        ))}
        {cells.map(({ s, vals }) => (
          <div key={s.id} className="contents" role="row">
            <div className="flex items-center text-navy text-[0.82rem] whitespace-nowrap pr-1">{s.name}</div>
            {vals.map((g, j) => {
              const b = world.brands[j];
              if (!g) return <div key={b.id} className="rounded-[5px] bg-line-2/60" aria-hidden />;
              const isNew = g.yoy === null;
              const v = isNew ? g.seq : g.yoy!;
              return (
                <Link
                  key={b.id}
                  href={app.href("/explorador/", { brand: b.id, store: s.id })}
                  title={`${s.name} · ${b.name}: ${f.int(g.next3)}`}
                  className="rounded-[5px] flex items-center justify-center font-semibold text-navy hover:ring-2 hover:ring-navy/40 leading-none min-h-0"
                  style={{ background: isNew ? tint(palette.gold, 0.25) : divergingColor(v) }}
                >
                  {isNew ? t("overview.newCell", { v: f.pctSigned(v) }) : f.pctSigned(v)}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[0.75rem] text-muted whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          {t("overview.heatLegend")}
          <span className="inline-block w-16 h-2.5 rounded-sm" style={{ background: `linear-gradient(90deg, ${divergingColor(-0.3)}, ${divergingColor(0)}, ${divergingColor(0.3)})` }} aria-hidden />
          {t("overview.heatLegendUp")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: tint(palette.gold, 0.25) }} aria-hidden />
          {t("overview.heatNew")}
        </span>
      </div>
    </Panel>
  );
}

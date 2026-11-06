"use client";
import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ArrowRight, BrainCircuit, ChevronDown, ChevronRight, ClipboardList, Database, GitMerge, Waves, Server, Users, CalendarRange, Truck, Landmark } from "lucide-react";
import { useApp } from "@/state/AppState";
import { BT_LEVELS, BT_METHODS } from "@/lib/backtest";
import { palette, tint } from "@/theme/tokens";
import { Panel, SectionTitle, Segmented } from "../ui";

const STEPS = [
  { key: "data", icon: Database },
  { key: "model", icon: BrainCircuit },
  { key: "ranges", icon: Waves },
  { key: "coherent", icon: GitMerge },
  { key: "order", icon: ClipboardList },
] as const;

export function HowItWorks() {
  const app = useApp();
  const { t, present } = app;
  const [openSteps, setOpen] = useState<Set<string>>(new Set());
  const allOpen = present;
  return (
    <div className="flex-1 min-h-0 flex flex-col px-8 pt-4 pb-4 gap-3.5">
      <div>
        <h1 className="text-[1.5rem] font-semibold text-navy leading-tight tracking-[-0.01em]">
          {t("how.title")} <span className="text-[0.95rem] font-normal text-muted ml-2">{t("how.sub")}</span>
        </h1>
      </div>
      <div className="grid grid-cols-[repeat(5,1fr)] gap-0 items-stretch">
        {STEPS.map((s, i) => {
          const open = allOpen || openSteps.has(s.key);
          const Icon = s.icon;
          return (
            <div key={s.key} className="flex items-stretch">
              <Panel className="flex-1 px-4 pt-2.5 pb-2.5 flex flex-col" delay={i * 50}>
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: tint(palette.teal, 0.16) }}>
                    <Icon size={19} color={palette.deepTeal} aria-hidden />
                  </span>
                  <div className="leading-tight">
                    <div className="text-[0.72rem] font-semibold text-muted">{t("how.step", { n: i + 1 })}</div>
                    <div className="text-[0.98rem] font-semibold text-navy">{t(`how.${s.key}.title`)}</div>
                  </div>
                </div>
                <p className="text-[0.84rem] text-navy mt-1.5 leading-snug">{t(`how.${s.key}.plain`)}</p>
                <button
                  onClick={() => setOpen((p) => {
                    const n = new Set(p);
                    if (n.has(s.key)) n.delete(s.key);
                    else n.add(s.key);
                    return n;
                  })}
                  className="mt-1.5 inline-flex items-center gap-1 text-[0.76rem] font-semibold text-deep-teal hover:underline self-start"
                  aria-expanded={open}
                >
                  {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                  {t("how.detail")}
                </button>
                {open && (
                  <ul className="mt-1 border-t border-line pt-1.5 text-[0.74rem] text-navy leading-snug list-disc pl-4 space-y-0.5">
                    {[1, 2, 3].map((k) => {
                      const key = `how.${s.key}.tech${k}`;
                      const v = t(key);
                      return v === key ? null : <li key={k}>{v}</li>;
                    })}
                  </ul>
                )}
              </Panel>
              {i < STEPS.length - 1 && (
                <div className="w-5 flex items-center justify-center shrink-0" aria-hidden>
                  <ArrowRight size={16} color={palette.secondary} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-[580px_1fr_330px] gap-3.5">
        <BacktestTable />
        <BacktestChart />
        <Needs />
      </div>
    </div>
  );
}

function BacktestTable() {
  const { backtest: bt, t, f } = useApp();
  return (
    <Panel className="px-5 pt-3.5 pb-3 flex flex-col">
      <SectionTitle sub={t("how.btSub", { n: bt.origins.length })}>{t("how.btTitle")}</SectionTitle>
      <table className="w-full text-[0.82rem] tnum">
        <thead>
          <tr className="text-muted text-[0.72rem] border-b border-line">
            <th className="text-left font-medium py-1">{t("how.level")}</th>
            {BT_METHODS.map((m) => (
              <th key={m} className={`text-right font-medium px-1 whitespace-nowrap ${m === "ai" ? "text-navy" : ""}`}>
                {t(`how.method.${m}`)}
              </th>
            ))}
            <th className="text-right font-medium px-1 whitespace-nowrap">{t("how.biasAi")}</th>
            <th className="text-right font-medium pl-1 whitespace-nowrap">{t("how.coverage")}</th>
          </tr>
        </thead>
        <tbody>
          {BT_LEVELS.map((lv) => {
            const m = bt.metrics[lv];
            const best = BT_METHODS.reduce((a, x) => (m[x].wape < m[a].wape ? x : a));
            return (
              <tr key={lv} className="border-b border-line-2 last:border-0">
                <td className="py-[4px] text-navy whitespace-nowrap">{t(`how.lv.${lv}`)}</td>
                {BT_METHODS.map((x) => (
                  <td key={x} className="text-right px-1">
                    <span className={`inline-block rounded px-1.5 ${x === best ? "font-semibold text-navy" : "text-navy"}`} style={x === best ? { background: tint(palette.green, 0.18) } : undefined}>
                      {f.pct1(m[x].wape)}
                    </span>
                  </td>
                ))}
                <td className="text-right px-1 text-navy">{f.pct1Signed(m.ai.bias)}</td>
                <td className="text-right pl-1 text-navy font-medium">{f.pct(bt.coverage[lv])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="text-[0.74rem] text-muted mt-1.5 leading-snug">{t("how.btNote")}</div>
      <div className="mt-auto pt-1.5 grid grid-cols-3 gap-2 text-[0.74rem] tnum">
        {[0, 1, 2].map((h) => (
          <div key={h} className="rounded-md bg-line-2/60 px-2.5 py-1">
            <div className="text-muted">{t("how.horizon", { n: h + 1 })}</div>
            <div className="text-navy">
              {t("how.horizonLine", { w: f.pct1(bt.wapeByHorizon.ai[h]), c: f.pct(bt.coverageByHorizon[h]) })}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function BacktestChart() {
  const app = useApp();
  const { backtest: bt, t, f, month, present } = app;
  const [idx, setIdx] = useState(bt.charts.length - 3);
  const c = bt.charts[idx];
  const rows = c.months.map((m, k) => {
    const h = k - (c.months.length - 3);
    const r: Record<string, number | [number, number] | undefined> = { t: m, actual: c.actual[k] };
    if (h >= 0) {
      r.ai = c.ai[h];
      r.band = [c.p10[h], c.p90[h]];
      r.sn = c.seasonalNaive[h];
      r.ma = c.movingAverage[h];
    }
    if (h === -1) {
      r.ai = c.actual[k];
      r.band = [c.actual[k], c.actual[k]];
      r.sn = c.actual[k];
      r.ma = c.actual[k];
    }
    return r;
  });
  return (
    <Panel className="px-5 pt-3.5 pb-2 flex flex-col min-h-0">
      <SectionTitle sub={t("how.chartSub")}>{t("how.chartTitle")}</SectionTitle>
      <div className="mb-1.5">
        <Segmented
          label={t("how.origin")}
          value={String(idx)}
          onChange={(v) => setIdx(Number(v))}
          options={bt.charts.map((ch, i) => ({ value: String(i), label: month(ch.origin) }))}
        />
      </div>
      <div className="flex items-center gap-4 text-[0.78rem] text-muted mb-1">
        <Key color={palette.navy}>{t("chart.actual")}</Key>
        <Key color={palette.deepTeal}>{t("how.method.ai")}</Key>
        <Key color={palette.indigo} dash>
          {t("how.method.seasonalNaive")}
        </Key>
        <Key color={palette.secondary} dash>
          {t("how.method.movingAverage")}
        </Key>
      </div>
      <div className="flex-1 min-h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={palette.divider} vertical={false} />
            <XAxis dataKey="t" type="number" domain={[c.months[0], c.months[c.months.length - 1]]} ticks={c.months.filter((_, k) => k % 3 === 2)} tickFormatter={(v) => month(v)} tick={{ fontSize: 12, fill: palette.secondary }} tickLine={false} axisLine={{ stroke: palette.divider }} />
            <YAxis tickFormatter={(v) => f.int(v)} tick={{ fontSize: 12, fill: palette.secondary }} axisLine={false} tickLine={false} width={44} domain={[(m: number) => Math.floor((m * 0.8) / 50) * 50, "auto"]} />
            <ReferenceLine x={c.origin} stroke={palette.navy} strokeOpacity={0.55} strokeDasharray="4 3" label={{ value: t("how.originLabel"), position: "insideTopLeft", fontSize: 12, fill: palette.navy, fontWeight: 600 }} />
            <Area dataKey="band" stroke="none" fill={palette.teal} fillOpacity={0.2} isAnimationActive={!present} />
            <Line dataKey="actual" stroke={palette.navy} strokeWidth={2.2} dot={{ r: 2.5, fill: palette.navy, strokeWidth: 0 }} isAnimationActive={!present} />
            <Line dataKey="sn" stroke={palette.indigo} strokeWidth={1.8} strokeDasharray="5 4" dot={false} isAnimationActive={!present} />
            <Line dataKey="ma" stroke={palette.secondary} strokeWidth={1.8} strokeDasharray="2 3" dot={false} isAnimationActive={!present} />
            <Line dataKey="ai" stroke={palette.deepTeal} strokeWidth={2.6} dot={{ r: 2.5, fill: palette.deepTeal, strokeWidth: 0 }} isAnimationActive={!present} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function Key({ color, children, dash = false }: { color: string; children: React.ReactNode; dash?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="16" height="4" aria-hidden>
        <line x1="0" y1="2" x2="16" y2="2" stroke={color} strokeWidth="2.5" strokeDasharray={dash ? "4 3" : undefined} />
      </svg>
      {children}
    </span>
  );
}

const NEEDS = [
  { key: "dms", icon: Server },
  { key: "crm", icon: Users },
  { key: "campaigns", icon: CalendarRange },
  { key: "lead", icon: Truck },
  { key: "fi", icon: Landmark },
] as const;

function Needs() {
  const { t } = useApp();
  return (
    <Panel className="px-5 pt-3 pb-2.5">
      <SectionTitle sub={t("how.needsSub")}>{t("how.needsTitle")}</SectionTitle>
      <ul className="flex flex-col gap-1.5">
        {NEEDS.map((n) => {
          const Icon = n.icon;
          return (
            <li key={n.key} className="flex gap-2.5">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: tint(palette.indigo, 0.12) }}>
                <Icon size={16} color={palette.indigo} aria-hidden />
              </span>
              <div className="leading-snug">
                <div className="text-[0.82rem] font-semibold text-navy leading-tight">{t(`how.need.${n.key}`)}</div>
                <div className="text-[0.72rem] text-muted leading-tight">{t(`how.need.${n.key}.sub`)}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

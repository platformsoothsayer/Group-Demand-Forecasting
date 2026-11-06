"use client";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { NodeStats, ScenarioRun } from "@/lib/engine";
import { useApp } from "@/state/AppState";
import { palette, tint } from "@/theme/tokens";

export interface FanRow {
  t: number;
  actual?: number;
  mean?: number;
  b90?: [number, number];
  b50?: [number, number];
  scen?: number;
  ly?: number;
}

/** History and forecast rows for a node. The forecast starts at the last actual so lines and bands connect. */
export function fanRows(engine: ScenarioRun["engine"], nodeId: string, base: NodeStats, histMonths: number, scen?: NodeStats): FanRow[] {
  const hist = engine.actuals(nodeId);
  const T = engine.tEnd;
  const rows: FanRow[] = [];
  for (let t = T - histMonths + 1; t <= T; t++) rows.push({ t, actual: hist[t] });
  const last = rows[rows.length - 1];
  last.mean = hist[T];
  last.b90 = [hist[T], hist[T]];
  last.b50 = [hist[T], hist[T]];
  if (scen) last.scen = hist[T];
  for (let h = 0; h < engine.H; h++) {
    rows.push({
      t: T + 1 + h,
      mean: base.mean[h],
      b90: [base.q10[h], base.q90[h]],
      b50: [base.q25[h], base.q75[h]],
      ...(scen ? { scen: scen.mean[h] } : {}),
      ly: hist[T + 1 + h - 12],
    });
  }
  return rows;
}

export function FanChart({
  rows,
  height,
  color = palette.teal,
  lineColor,
  compact = false,
  annotations = false,
  showScenario = false,
  yWidth = 48,
  scenarioLabel,
  baselineLabel,
}: {
  rows: FanRow[];
  height: number | `${number}%`;
  color?: string;
  lineColor?: string;
  compact?: boolean;
  annotations?: boolean;
  showScenario?: boolean;
  yWidth?: number;
  scenarioLabel?: string;
  baselineLabel?: string;
}) {
  const app = useApp();
  const { f, month, t, present } = app;
  const T = app.engine.tEnd;
  const first = rows[0].t;
  const last = rows[rows.length - 1].t;
  const ticks = rows.filter((r) => (compact ? r.t === first || r.t === T || r.t === last : (r.t - T) % 3 === 0)).map((r) => r.t);
  const anim = !present;
  const maxV = Math.max(...rows.map((r) => Math.max(r.actual ?? 0, r.b90?.[1] ?? 0, r.scen ?? 0)));
  const fc = rows.filter((r) => r.t > T);
  const lineC = lineColor ?? (color === palette.teal ? palette.deepTeal : color);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: annotations ? 26 : compact ? 6 : 12, right: compact ? 6 : 22, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={palette.divider} strokeDasharray="0" vertical={false} />
        <ReferenceArea x1={T} x2={last} fill={tint(palette.teal, 0.07)} fillOpacity={1} stroke="none" ifOverflow="extendDomain" />
        <XAxis
          dataKey="t"
          type="number"
          domain={[first, last]}
          ticks={ticks}
          tickFormatter={(v) => (compact ? month(v, false) : month(v))}
          tick={{ fontSize: compact ? 12 : 12.5, fill: palette.secondary }}
          axisLine={{ stroke: palette.divider }}
          tickLine={false}
          interval={0}
          height={compact ? 0 : 24}
          hide={compact}
        />
        <YAxis
          width={compact ? 0 : yWidth}
          hide={compact}
          domain={[0, Math.ceil((maxV * 1.08) / 10) * 10]}
          tickFormatter={(v) => f.int(v)}
          tick={{ fontSize: 12.5, fill: palette.secondary }}
          axisLine={false}
          tickLine={false}
        />
        {!compact && !present && (
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as FanRow;
              return (
                <div className="panel px-3 py-2 text-[0.8rem] tnum">
                  <div className="font-semibold text-navy mb-0.5">{month(Number(label))}</div>
                  {r.actual !== undefined && (
                    <div>
                      {t("chart.actual")}: <b>{f.int(r.actual)}</b>
                    </div>
                  )}
                  {r.t > T && r.mean !== undefined && (
                    <>
                      <div>
                        {t("chart.forecast")}: <b>{f.int(r.mean)}</b>
                      </div>
                      <div className="text-muted">{t("chart.range", { lo: f.int(r.b90![0]), hi: f.int(r.b90![1]) })}</div>
                      {r.scen !== undefined && (
                        <div>
                          {t("chart.scenario")}: <b>{f.int(r.scen)}</b>
                        </div>
                      )}
                      {r.ly !== undefined && <div className="text-muted">{t("chart.lastYear", { v: f.int(r.ly) })}</div>}
                    </>
                  )}
                </div>
              );
            }}
          />
        )}
        <Area dataKey="b90" stroke="none" fill={color} fillOpacity={0.18} isAnimationActive={anim} connectNulls={false} />
        <Area dataKey="b50" stroke="none" fill={color} fillOpacity={0.26} isAnimationActive={anim} connectNulls={false} />
        <ReferenceLine x={T} stroke={palette.navy} strokeOpacity={0.55} strokeDasharray="4 3" label={compact ? undefined : { value: t("chart.today"), position: "insideBottomLeft", fill: palette.navy, fontSize: 12.5, fontWeight: 600, dx: 4, dy: -4 }} />
        <Line dataKey="actual" stroke={palette.navy} strokeWidth={compact ? 1.6 : 2.2} dot={false} isAnimationActive={anim} connectNulls={false} />
        <Line dataKey="mean" stroke={lineC} strokeWidth={compact ? 2 : 2.6} dot={compact ? false : { r: 2.5, fill: lineC, strokeWidth: 0 }} isAnimationActive={anim} name={baselineLabel} />
        {showScenario && <Line dataKey="scen" stroke={palette.amber} strokeWidth={compact ? 2 : 2.8} dot={compact ? false : { r: 2.5, fill: palette.amber, strokeWidth: 0 }} isAnimationActive={anim} name={scenarioLabel} />}
        {annotations && fc.length >= 3 && (
          <>
            <ReferenceDot x={fc[0].t} y={fc[0].b90![1]} r={0} label={{ value: t("chart.ann.buenFin"), position: "left", fill: palette.navy, fontSize: 12.5, fontWeight: 600, dx: -2 }} />
            <ReferenceDot x={fc[1].t} y={fc[1].b90![1]} r={0} label={{ value: t("chart.ann.december"), position: "top", fill: palette.navy, fontSize: 12.5, fontWeight: 600 }} />
            <ReferenceDot x={fc[2].t} y={fc[2].b90![0]} r={0} label={{ value: t("chart.ann.january"), position: "bottom", fill: palette.navy, fontSize: 12.5, fontWeight: 600, dy: 2 }} />
          </>
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Direct-label legend for fan charts. */
export function FanLegend({ color = palette.teal, scenario = false, compact = false, minimal = false }: { color?: string; scenario?: boolean; compact?: boolean; minimal?: boolean }) {
  const { t } = useApp();
  const line = (c: string, w = 14) => <span className="inline-block rounded-full" style={{ width: w, height: 3, background: c }} aria-hidden />;
  return (
    <div className={`flex items-center gap-x-4 gap-y-1 ${compact ? "text-[0.75rem]" : "text-[0.8rem]"} text-muted flex-wrap`}>
      <span className="inline-flex items-center gap-1.5">
        {line(palette.navy)}
        {t("chart.actual")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        {line(color === palette.teal ? palette.deepTeal : color)}
        {t("chart.forecastP50")}
      </span>
      {!minimal && (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-3 rounded-sm" style={{ background: color, opacity: 0.38 }} aria-hidden />
          {t("chart.band50")}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-4 h-3 rounded-sm" style={{ background: color, opacity: 0.18 }} aria-hidden />
        {t("chart.band80")}
      </span>
      {scenario && (
        <span className="inline-flex items-center gap-1.5">
          {line(palette.amber)}
          {t("chart.scenario")}
        </span>
      )}
    </div>
  );
}

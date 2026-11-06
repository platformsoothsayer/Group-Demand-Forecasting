"use client";
import type { ReactNode } from "react";
import { brandColor, palette } from "@/theme/tokens";

export function Panel({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <div className={`panel anim-rise ${className}`} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-6 mb-3">
      <div className="min-w-0">
        <h1 className="text-[1.5rem] font-semibold text-navy leading-tight tracking-[-0.01em]">{title}</h1>
        {subtitle && <div className="text-[0.95rem] text-muted mt-0.5">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

export function SectionTitle({ children, sub, right }: { children: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[1rem] font-semibold text-navy leading-snug">{children}</h2>
        {sub && <div className="text-[0.82rem] text-muted mt-0.5 leading-snug">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function Sparkline({ data, split, color = palette.deepTeal, height = 28 }: { data: number[]; split?: number; color?: string; height?: number }) {
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const span = hi - lo || 1;
  const W = 100;
  const xy = (v: number, i: number) => [(i / (data.length - 1)) * W, 3 + (1 - (v - lo) / span) * (height - 6)] as const;
  const pts = (d: number[], off = 0) => d.map((v, i) => xy(v, i + off).map((x) => x.toFixed(2)).join(",")).join(" ");
  const histPart = split !== undefined ? data.slice(0, split + 1) : data;
  const fcPart = split !== undefined ? data.slice(split) : [];
  const id = `sg${color.slice(1)}${height}`;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full anim-fade" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.2" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts(data)} ${W},${height}`} fill={`url(#${id})`} />
      <polyline points={pts(histPart)} fill="none" stroke={split !== undefined ? palette.navy : color} strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {fcPart.length > 1 && <polyline points={pts(fcPart, split)} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/** Delta chip: arrow plus signed percent. Color says good or bad, the arrow and sign say direction. */
export function DeltaChip({ value, text, goodWhen = "up" }: { value: number; text: string; goodWhen?: "up" | "down" | "none" }) {
  const up = value > 0;
  const flat = Math.abs(value) < 0.0005;
  const good = flat || goodWhen === "none" ? null : (up && goodWhen === "up") || (!up && goodWhen === "down");
  const cls = good === null ? "bg-line-2" : good ? "bg-green-soft" : "bg-coral-soft";
  const arrowColor = good === null ? palette.secondary : good ? palette.green : palette.coral;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-[1px] text-[0.78rem] font-semibold tnum whitespace-nowrap text-navy ${cls}`}>
      <span style={{ color: arrowColor }} aria-hidden>
        {flat ? "■" : up ? "▲" : "▼"}
      </span>
      {text}
    </span>
  );
}

export function BrandDot({ brand, size = 9 }: { brand: string; size?: number }) {
  return <span className="inline-block rounded-full shrink-0" style={{ width: size, height: size, background: brandColor[brand] ?? palette.secondary }} aria-hidden />;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  small = false,
  disabled = false,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "amber";
  small?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const cls = {
    primary: "bg-deep-teal text-white hover:brightness-110 shadow-[0_1px_2px_rgb(11_31_58/0.15)]",
    secondary: "bg-surface text-navy ring-1 ring-line hover:ring-deep-teal hover:text-deep-teal",
    ghost: "text-muted hover:text-navy",
    amber: "bg-amber text-navy hover:brightness-105 shadow-[0_1px_2px_rgb(11_31_58/0.15)]",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${cls} ${small ? "px-2.5 py-1 text-[0.8rem]" : "px-4 py-1.5 text-[0.9rem]"} rounded-md font-medium whitespace-nowrap inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="inline-flex items-center rounded-lg bg-line-2 p-[3px] text-[0.82rem]" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`px-2.5 py-[3px] rounded-md whitespace-nowrap transition ${value === o.value ? "bg-surface text-navy font-semibold shadow-sm" : "text-muted hover:text-navy"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Kpi({ label, value, sub, delta, spark, sparkSplit, sparkColor, valueClass = "text-navy", textValue = false }: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  delta?: ReactNode;
  spark?: number[];
  sparkSplit?: number;
  sparkColor?: string;
  valueClass?: string;
  /** Names instead of numbers: slightly smaller so they never truncate. */
  textValue?: boolean;
}) {
  return (
    <div className="px-4 min-w-0 flex flex-col">
      <div className="text-[0.82rem] text-muted leading-snug truncate">{label}</div>
      <div className="flex items-end gap-3 mt-0.5">
        <div className={`kpi-value ${textValue ? "text-[1.7rem]" : "text-[2.05rem]"} font-semibold leading-[1.15] whitespace-nowrap ${valueClass}`}>{value}</div>
        {spark && (
          <div className="flex-1 min-w-[2.5rem] pb-1.5">
            <Sparkline data={spark} split={sparkSplit} color={sparkColor} height={28} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1 min-h-[24px]">{delta}</div>
      {sub && <div className="text-[0.78rem] text-muted mt-1 tnum leading-snug truncate">{sub}</div>}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  amber = false,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  amber?: boolean;
  label: string;
}) {
  return (
    <input
      type="range"
      aria-label={label}
      className={`slider w-full ${amber ? "amber" : ""}`}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

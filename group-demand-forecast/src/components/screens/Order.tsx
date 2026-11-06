"use client";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, LineChart as LineIcon, RotateCcw, CalendarClock, ArrowDown, ArrowUp } from "lucide-react";
import { useApp } from "@/state/AppState";
import type { OrderLine, SeasonKey } from "@/lib/ordering";
import { orderSummary } from "@/lib/kpis";
import { brandColor, carColor, palette, seasonColor, tint } from "@/theme/tokens";
import { BrandDot, Button, Panel, SectionTitle, Slider } from "../ui";

type SortKey = "value" | "suggested" | "demand" | "onHand" | "name";

interface Group {
  key: string;
  store: string;
  model: string;
  brand: string;
  lines: OrderLine[];
  demand: number;
  onHand: number;
  inTransit: number;
  safety: number;
  suggested: number;
  value: number;
  floorplan: number;
  flags: SeasonKey[];
  storyId?: number;
}

export function Order() {
  const app = useApp();
  const { t, f, order, orderSettings: s, dispatch, world, present, approved, params, setParams } = app;
  const [brandFilter, setBrandFilter] = useState<string | null>(params.get("brand"));
  const [storeFilter, setStoreFilter] = useState<string | null>(params.get("store"));
  const [onlyOrder, setOnlyOrder] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "value", dir: -1 });
  const open = new Set((params.get("open") ?? "").split(",").filter(Boolean));
  const toggle = (k: string) => {
    const n = new Set(open);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setParams({ open: n.size ? [...n].join(",") : null });
  };

  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const l of order.lines) {
      const key = `${l.store}:${l.model}`;
      let g = m.get(key);
      if (!g) {
        g = { key, store: l.store, model: l.model, brand: l.brand, lines: [], demand: 0, onHand: 0, inTransit: 0, safety: 0, suggested: 0, value: 0, floorplan: 0, flags: l.flags, storyId: l.storyId };
        m.set(key, g);
      }
      g.lines.push(l);
      g.demand += l.demand;
      g.onHand += l.onHand;
      g.inTransit += l.inTransit;
      g.safety += l.safety;
      g.suggested += l.suggested;
      g.value += l.value;
      g.floorplan += l.floorplanMonthly;
    }
    return [...m.values()];
  }, [order]);

  const visible = groups
    .filter((g) => (!brandFilter || g.brand === brandFilter) && (!storeFilter || g.store === storeFilter) && (!onlyOrder || g.suggested > 0))
    .sort((a, b) => {
      if (sort.key === "name") return sort.dir * (app.storeName(a.store) + a.model).localeCompare(app.storeName(b.store) + b.model);
      return sort.dir * (a[sort.key] - b[sort.key]);
    });
  const visibleIds = visible.flatMap((g) => g.lines.filter((l) => l.suggested > 0).map((l) => l.id));
  const allApproved = visibleIds.length > 0 && visibleIds.every((id) => approved.has(id));
  const totals = app.orderTotals;
  const appr = app.approvedTotals;

  const head = (key: SortKey, label: string, align = "text-right") => (
    <th className={`${align} font-medium py-1.5 px-1.5 whitespace-nowrap`}>
      <button
        onClick={() => setSort((p) => ({ key, dir: p.key === key ? ((-p.dir) as 1 | -1) : -1 }))}
        className={`inline-flex items-center gap-0.5 hover:text-navy ${sort.key === key ? "text-navy font-semibold" : ""}`}
      >
        {label}
        {sort.key === key && (sort.dir < 0 ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />)}
      </button>
    </th>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col px-8 pt-4 pb-4 gap-3.5">
      <Panel className="px-5 py-2.5 flex items-center gap-6">
        <div className="shrink-0">
          <h1 className="text-[1.2rem] font-semibold text-navy leading-tight whitespace-nowrap">{t("order.title")}</h1>
          <div className="text-[0.78rem] text-muted whitespace-nowrap">{t("order.sub", { r: s.reviewDays })}</div>
        </div>
        <Setting label={t("order.serviceLevel")} value={f.pct(s.serviceLevel)} present={present}>
          <Slider label={t("order.serviceLevel")} value={Math.round(s.serviceLevel * 100)} min={85} max={98} step={1} onChange={(v) => dispatch({ type: "setOrder", patch: { serviceLevel: v / 100 } })} />
        </Setting>
        <Setting label={t("order.rate")} value={f.pct1(s.floorplanRate)} present={present}>
          <Slider label={t("order.rate")} value={Math.round(s.floorplanRate * 1000) / 10} min={6} max={18} step={0.5} onChange={(v) => dispatch({ type: "setOrder", patch: { floorplanRate: v / 100 } })} />
        </Setting>
        <div className="min-w-0">
          <div className="text-[0.75rem] text-muted mb-1 whitespace-nowrap">{t("order.leadTimes")}</div>
          <div className="flex gap-1">
            {world.brands.map((b) => (
              <div key={b.id} className="flex items-center gap-1 rounded-md ring-1 ring-line pl-1.5 pr-0.5 py-0.5 text-[0.76rem] tnum whitespace-nowrap">
                <BrandDot brand={b.id} size={7} />
                <span className="text-navy font-medium">{b.name}</span>
                {present ? (
                  <span className="text-navy font-semibold px-1">{s.leadDays[b.id]}</span>
                ) : (
                  <select
                    value={s.leadDays[b.id]}
                    onChange={(e) => dispatch({ type: "setLead", brand: b.id, days: Number(e.target.value) })}
                    className="bg-transparent text-navy font-semibold"
                    aria-label={`${t("order.leadTimes")} ${b.name}`}
                  >
                    {[15, 30, 45, 60, 75, 90, 105, 120, 135, 150].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
        {!present && (
          <div className="ml-auto">
            <Button variant="ghost" small onClick={() => dispatch({ type: "resetOrder" })}>
              <RotateCcw size={14} aria-hidden />
              {t("order.resetAssumptions")}
            </Button>
          </div>
        )}
      </Panel>

      <div className="flex-1 min-h-0 grid grid-cols-[1fr_400px] gap-3.5">
        <Panel className="flex flex-col min-h-0">
          <div className="px-4 pt-2.5 pb-2 flex items-center gap-1.5 border-b border-line whitespace-nowrap">
            <FilterChip active={!brandFilter} onClick={() => setBrandFilter(null)}>
              {t("order.allBrands")}
            </FilterChip>
            {world.brands.map((b) => (
              <FilterChip key={b.id} active={brandFilter === b.id} onClick={() => setBrandFilter(brandFilter === b.id ? null : b.id)}>
                <BrandDot brand={b.id} size={7} />
                {b.name}
              </FilterChip>
            ))}
            <select
              value={storeFilter ?? ""}
              onChange={(e) => setStoreFilter(e.target.value || null)}
              className="text-[0.76rem] rounded-full ring-1 ring-line px-1.5 py-[2px] text-navy bg-surface"
              aria-label={t("order.dealership")}
            >
              <option value="">{t("order.allDealerships")}</option>
              {world.stores.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1 text-[0.76rem] text-navy ml-1">
              <input type="checkbox" checked={onlyOrder} onChange={(e) => setOnlyOrder(e.target.checked)} className="accent-[var(--c-deep-teal)]" />
              {t("order.onlyWithOrder")}
            </label>
            <div className="ml-auto">
              <Button small variant={allApproved ? "secondary" : "primary"} onClick={() => dispatch({ type: allApproved ? "unapprove" : "approve", ids: visibleIds })} disabled={!visibleIds.length}>
                <Check size={14} aria-hidden />
                {allApproved ? t("order.unapproveAll") : t("order.approveAll")}
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto scroll-thin">
            <table className="w-full text-[0.84rem] tnum">
              <thead className="sticky top-0 bg-surface z-10 shadow-[0_1px_0_var(--c-divider)]">
                <tr className="text-muted text-[0.75rem]">
                  <th className="w-7" />
                  {head("name", t("order.colLine"), "text-left")}
                  {head("demand", t("order.colDemand"))}
                  {head("onHand", t("order.colOnHand"))}
                  <th className="text-right font-medium px-1.5">{t("order.colInTransit")}</th>
                  <th className="text-right font-medium px-1.5">{t("order.colSafety")}</th>
                  {head("suggested", t("order.colSuggested"))}
                  {head("value", t("order.colValue"))}
                  <th className="text-right font-medium px-1.5 whitespace-nowrap">{t("order.colFloorplan")}</th>
                  <th className="text-left font-medium px-1.5">{t("order.colSeason")}</th>
                  <th className="text-right font-medium px-2">{t("order.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((g) => {
                  const isOpen = open.has(g.key);
                  const ids = g.lines.filter((l) => l.suggested > 0).map((l) => l.id);
                  const gApproved = ids.length > 0 && ids.every((id) => approved.has(id));
                  const shown = g.lines.filter((l) => l.suggested > 0 || l.onHand > 0 || l.inTransit > 0).sort((a, b) => b.suggested - a.suggested || b.demand - a.demand);
                  return (
                    <Fragment key={g.key}>
                      <tr className={`border-b border-line-2 ${isOpen ? "bg-teal-soft/40" : "hover:bg-line-2/40"}`}>
                        <td className="pl-3">
                          <button onClick={() => toggle(g.key)} aria-expanded={isOpen} aria-label={t("order.expand")} className="text-muted hover:text-navy">
                            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="py-[6px] px-1.5 text-navy whitespace-nowrap">
                          <span className="inline-flex items-center gap-2">
                            <BrandDot brand={g.brand} />
                            <span className="font-semibold">{app.storeName(g.store)}</span>
                            <span>
                              {app.brandName(g.brand)} {app.modelName(g.model)}
                            </span>
                          </span>
                        </td>
                        <td className="text-right px-1.5 text-navy">{f.dec1(g.demand)}</td>
                        <td className="text-right px-1.5 text-navy">{f.int(g.onHand)}</td>
                        <td className="text-right px-1.5 text-navy">{f.int(g.inTransit)}</td>
                        <td className="text-right px-1.5 text-muted">{f.dec1(g.safety)}</td>
                        <td className="text-right px-1.5">
                          <span className="inline-block min-w-[34px] rounded px-1.5 py-[1px] font-semibold text-navy" style={{ background: g.suggested ? tint(palette.teal, 0.2) : "transparent" }}>
                            {f.int(g.suggested)}
                          </span>
                        </td>
                        <td className="text-right px-1.5 text-navy font-medium">{f.moneyCompact(g.value)}</td>
                        <td className="text-right px-1.5 text-navy">{f.moneyCompact(g.floorplan)}</td>
                        <td className="px-1.5">
                          <Flags flags={g.flags} />
                        </td>
                        <td className="px-2 text-right whitespace-nowrap">
                          <Link href={app.href("/explorador/", { brand: g.brand, model: g.model, store: g.store })} title={t("order.toExplorer")} className="inline-flex align-middle text-muted hover:text-deep-teal mr-1.5">
                            <LineIcon size={16} aria-label={t("order.toExplorer")} />
                          </Link>
                          <ApproveButton approved={gApproved} disabled={!ids.length} onClick={() => dispatch({ type: gApproved ? "unapprove" : "approve", ids })} label={t("order.approveModel")} />
                        </td>
                      </tr>
                      {isOpen &&
                        shown.map((l) => (
                          <tr key={l.id} className="border-b border-line-2 bg-bg/60 text-[0.8rem]">
                            <td />
                            <td className="py-[4px] px-1.5 pl-6 text-navy whitespace-nowrap">
                              <span className="inline-flex items-center gap-2">
                                <span className="inline-block w-3 h-3 rounded-sm ring-1 ring-line" style={{ background: carColor[l.color] }} aria-hidden />
                                {t(`trim.${world.trims[l.trim]}`)} · {t(`color.${world.colors[l.color]}`)}
                              </span>
                            </td>
                            <td className="text-right px-1.5 text-navy">{f.dec1(l.demand)}</td>
                            <td className="text-right px-1.5 text-navy">{f.int(l.onHand)}</td>
                            <td className="text-right px-1.5 text-navy">{f.int(l.inTransit)}</td>
                            <td className="text-right px-1.5 text-muted">{f.dec1(l.safety)}</td>
                            <td className="text-right px-1.5 font-semibold text-navy">{f.int(l.suggested)}</td>
                            <td className="text-right px-1.5 text-navy">{f.moneyCompact(l.value)}</td>
                            <td className="text-right px-1.5 text-navy">{f.moneyCompact(l.floorplanMonthly)}</td>
                            <td />
                            <td className="px-2 text-right">
                              <ApproveButton approved={approved.has(l.id)} disabled={!l.suggested} onClick={() => dispatch({ type: approved.has(l.id) ? "unapprove" : "approve", ids: [l.id] })} label={t("order.approveLine")} small />
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2 border-t border-line text-[0.75rem] text-muted">{t("order.formula")}</div>
        </Panel>

        <div className="min-h-0 flex flex-col gap-3.5">
          <Panel className="px-5 pt-3 pb-3">
            <SectionTitle>{t("order.summaryTitle")}</SectionTitle>
            <div className="grid grid-cols-[0.8fr_1.2fr_1fr] gap-x-3 tnum">
              <Big label={t("order.units")} value={f.int(totals.units)} />
              <Big label={t("order.value")} value={f.moneyCompact(totals.value)} />
              <Big label={t("order.interest")} value={f.moneyCompact(totals.floorplanMonthly)} />
            </div>
            <div className="text-[0.72rem] text-muted mt-1 leading-snug">{t("order.creditNote", { rate: f.pct1(s.floorplanRate) })}</div>
            <div className="mt-2 rounded-lg px-3 py-1.5 bg-teal-soft flex items-center justify-between text-[0.85rem] text-navy" data-testid="order-approved">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Check size={15} color={palette.deepTeal} aria-hidden />
                {t("order.approved")}
              </span>
              <span className="tnum font-semibold">{t("order.approvedValue", { u: f.int(appr.units), v: f.moneyCompact(appr.value) })}</span>
            </div>
          </Panel>
          <ByDealership />
          <SeasonCallout />
        </div>
      </div>
    </div>
  );
}

function Setting({ label, value, children, present }: { label: string; value: string; children: React.ReactNode; present: boolean }) {
  return (
    <div className={`${present ? "w-auto" : "w-[170px]"} shrink-0`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[0.75rem] text-muted whitespace-nowrap">{label}</span>
        <span className="text-[0.95rem] font-semibold text-navy tnum">{value}</span>
      </div>
      {!present && <div className="mt-1">{children}</div>}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[0.76rem] ring-1 transition ${active ? "bg-teal-soft ring-deep-teal text-navy font-semibold" : "ring-line text-navy hover:ring-navy/40"}`}>
      {children}
    </button>
  );
}

function ApproveButton({ approved, onClick, disabled, label, small = false }: { approved: boolean; onClick: () => void; disabled: boolean; label: string; small?: boolean }) {
  const { t } = useApp();
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`inline-flex items-center gap-1 rounded-md ${small ? "px-1.5 py-[1px] text-[0.75rem]" : "px-2 py-[2px] text-[0.78rem]"} font-semibold transition disabled:opacity-30 ${
        approved ? "bg-deep-teal text-white" : "ring-1 ring-line text-navy hover:ring-deep-teal"
      }`}
    >
      <Check size={12} aria-hidden />
      {approved ? t("order.approvedShort") : t("order.approve")}
    </button>
  );
}

export function Flags({ flags, short = false }: { flags: SeasonKey[]; short?: boolean }) {
  const { t } = useApp();
  return (
    <span className="inline-flex gap-1">
      {flags.map((fl) => (
        <span key={fl} className="rounded px-1.5 py-[1px] text-[0.72rem] font-semibold text-navy whitespace-nowrap" style={{ background: tint(seasonColor[fl], fl === "buenFin" ? 0.3 : 0.18), boxShadow: `inset 2px 0 0 ${seasonColor[fl]}` }}>
          {t(short ? `season.short.${fl}` : `season.${fl}`)}
        </span>
      ))}
    </span>
  );
}

function Big({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="leading-tight">
      <div className="text-[0.75rem] text-muted whitespace-nowrap">{label}</div>
      <div className={`${small ? "text-[1.05rem]" : "text-[1.3rem]"} font-semibold text-navy kpi-value whitespace-nowrap`}>{value}</div>
    </div>
  );
}

function ByDealership() {
  const app = useApp();
  const { order, world, t, f } = app;
  const all = world.stores
    .map((s) => {
      const byB = world.brands.map((b) => orderSummary(order.lines.filter((l) => l.store === s.id && l.brand === b.id)).value);
      return { key: s.id, name: s.name, byB, total: byB.reduce((a, b) => a + b, 0) };
    })
    .sort((a, b) => b.total - a.total);
  // Top 6 dealerships plus the rest combined, so the panel fits the screen.
  const TOP = 5;
  const rest = all.slice(TOP);
  const rows = rest.length
    ? [
        ...all.slice(0, TOP),
        {
          key: "rest",
          name: t("order.otherDealers", { n: rest.length }),
          byB: world.brands.map((_, k) => rest.reduce((a, r) => a + r.byB[k], 0)),
          total: rest.reduce((a, r) => a + r.total, 0),
        },
      ]
    : all;
  const max = Math.max(1, ...rows.map((r) => r.total));
  const byBrand = world.brands.map((b) => ({ b, v: orderSummary(order.lines.filter((l) => l.brand === b.id)).value }));
  return (
    <Panel className="px-5 pt-3 pb-2.5 flex-1 min-h-0 flex flex-col overflow-hidden">
      <SectionTitle>{t("order.byDealerTitle")}</SectionTitle>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0 mb-1.5 text-[0.72rem] text-navy tnum">
        {byBrand.map(({ b, v }) => (
          <span key={b.id} className="inline-flex items-center gap-1 whitespace-nowrap">
            <BrandDot brand={b.id} size={8} />
            {b.name} {f.moneyCompact(v)}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-[3px] min-h-0 overflow-hidden">
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[96px_1fr_70px] items-center gap-2 text-[0.76rem] leading-tight">
            <span className={`truncate ${r.key === "rest" ? "text-muted" : "text-navy"}`}>{r.name}</span>
            <div className="h-[11px] flex rounded-[3px] overflow-hidden bg-line-2/50" style={{ width: `${(r.total / max) * 100}%`, minWidth: 2 }}>
              {r.byB.map((v, k) => (v > 0 ? <div key={k} className="h-full anim-grow" style={{ width: `${(v / r.total) * 100}%`, background: brandColor[world.brands[k].id] }} title={`${world.brands[k].name} ${f.moneyCompact(v)}`} /> : null))}
            </div>
            <span className="text-right tnum text-navy font-medium whitespace-nowrap">{f.moneyCompact(r.total)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function groupsByWindow(items: { id: string; a: { from: number; to: number; flags: SeasonKey[] } }[]) {
  const m = new Map<string, { key: string; brands: string[]; a: { from: number; to: number; flags: SeasonKey[] } }>();
  for (const it of items) {
    const key = `${it.a.from}-${it.a.to}`;
    const g = m.get(key) ?? { key, brands: [], a: it.a };
    g.brands.push(it.id);
    m.set(key, g);
  }
  return [...m.values()];
}

function SeasonCallout() {
  const app = useApp();
  const { order, world, t, lang } = app;
  const fmt = (d: number) => {
    const dt = new Date(Date.parse(`${world.asOf}T00:00:00Z`) + d * 86400000);
    return new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(dt).replace(".", "");
  };
  return (
    <Panel className="px-5 pt-3 pb-2.5">
      <SectionTitle sub={t("order.seasonSub")}>
        <span className="inline-flex items-center gap-2">
          <CalendarClock size={17} color={palette.indigo} aria-hidden />
          {t("order.seasonTitle")}
        </span>
      </SectionTitle>
      <div className="flex flex-col gap-[3px] text-[0.78rem]">
        {groupsByWindow(world.brands.map((b) => ({ id: b.id, a: order.arrival[b.id] }))).map((g) => (
          <div key={g.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
            <div className="flex items-center gap-x-1.5 text-navy font-medium flex-wrap min-w-0 text-[0.76rem]">
              {g.brands.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 whitespace-nowrap">
                  <BrandDot brand={id} size={7} />
                  {app.brandName(id)}
                </span>
              ))}
            </div>
            <div className="text-navy tnum text-[0.76rem] whitespace-nowrap">{t("order.arrives", { from: fmt(g.a.from), to: fmt(g.a.to) })}</div>
            {g.a.flags.length ? <Flags flags={g.a.flags} short /> : <span className="text-[0.72rem] text-muted whitespace-nowrap">{t("order.afterSeason")}</span>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

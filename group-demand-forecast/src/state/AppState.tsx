"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import worldJson from "@/data/world.json";
import historyJson from "@/data/history.json";
import inventoryJson from "@/data/inventory.json";
import forecastJson from "@/data/forecast.json";
import backtestJson from "@/data/backtest.json";
import type { History, Inventory, World } from "@/lib/types";
import type { ForecastFile } from "@/lib/forecastFile";
import type { BacktestResult } from "@/lib/backtest";
import { Engine, type ScenarioRun } from "@/lib/engine";
import { NEUTRAL, isNeutral, scenarioKey, type Scenario } from "@/lib/scenario";
import { computeOrder, defaultOrderSettings, type OrderResult, type OrderSettings } from "@/lib/ordering";
import { approvedSummary, orderSummary, type OrderSum } from "@/lib/kpis";
import { translate, type DictKey, type Lang } from "@/i18n";
import { makeFormat, monthLabel, type Fmt } from "@/lib/format";

const world = worldJson as unknown as World;
const history = historyJson as unknown as History;
const inventory = inventoryJson as unknown as Inventory;
const fc = forecastJson as unknown as ForecastFile;
const backtest = backtestJson as unknown as BacktestResult;

export interface SavedScenario {
  name: string;
  scenario: Scenario;
}

interface PersistState {
  scenario: Scenario;
  saved: SavedScenario[];
  order: OrderSettings;
  approved: string[];
}

type Action =
  | { type: "setScenario"; patch: Partial<Scenario> }
  | { type: "replaceScenario"; scenario: Scenario }
  | { type: "resetScenario" }
  | { type: "saveScenario"; name: string }
  | { type: "deleteSaved"; index: number }
  | { type: "setOrder"; patch: Partial<OrderSettings> }
  | { type: "setLead"; brand: string; days: number }
  | { type: "resetOrder" }
  | { type: "approve"; ids: string[] }
  | { type: "unapprove"; ids: string[] }
  | { type: "load"; state: PersistState };

const initial: PersistState = { scenario: NEUTRAL, saved: [], order: defaultOrderSettings(world), approved: [] };

function reducer(s: PersistState, a: Action): PersistState {
  switch (a.type) {
    case "setScenario":
      return { ...s, scenario: { ...s.scenario, ...a.patch, campaign: { ...s.scenario.campaign, ...(a.patch.campaign ?? {}) } } };
    case "replaceScenario":
      return { ...s, scenario: a.scenario };
    case "resetScenario":
      return { ...s, scenario: NEUTRAL };
    case "saveScenario": {
      const saved = [...s.saved.filter((x) => x.name !== a.name), { name: a.name, scenario: s.scenario }];
      return { ...s, saved: saved.slice(-3) };
    }
    case "deleteSaved":
      return { ...s, saved: s.saved.filter((_, i) => i !== a.index) };
    case "setOrder":
      return { ...s, order: { ...s.order, ...a.patch } };
    case "setLead":
      return { ...s, order: { ...s.order, leadDays: { ...s.order.leadDays, [a.brand]: a.days } } };
    case "resetOrder":
      return { ...s, order: defaultOrderSettings(world) };
    case "approve":
      return { ...s, approved: [...new Set([...s.approved, ...a.ids])] };
    case "unapprove": {
      const drop = new Set(a.ids);
      return { ...s, approved: s.approved.filter((id) => !drop.has(id)) };
    }
    case "load":
      return a.state;
  }
}

/** Scenario from URL parameters (reproducible links and screenshots). */
function scenarioFromParams(p: URLSearchParams): Scenario | null {
  const keys = ["credit", "fuel", "conf", "leads", "camp"];
  if (!keys.some((k) => p.has(k))) return null;
  const num = (k: string) => (p.has(k) ? Number(p.get(k)) || 0 : 0);
  const camp = p.get("camp")?.split(":");
  return {
    credit: num("credit"),
    fuel: num("fuel"),
    confidence: num("conf"),
    leads: num("leads"),
    campaign: camp && camp[0] ? { brand: camp[0], depth: Number(camp[1]) || 0, start: Number(camp[2]) || 0, months: Number(camp[3]) || 2 } : NEUTRAL.campaign,
  };
}

export interface AppValue {
  lang: Lang;
  present: boolean;
  t: (key: DictKey | string, params?: Record<string, string | number>) => string;
  f: Fmt;
  month: (t: number, withYear?: boolean) => string;
  world: World;
  history: History;
  inventory: Inventory;
  fc: ForecastFile;
  backtest: BacktestResult;
  engine: Engine;
  base: ScenarioRun;
  run: ScenarioRun;
  scenario: Scenario;
  scenarioActive: boolean;
  saved: SavedScenario[];
  orderSettings: OrderSettings;
  order: OrderResult;
  orderTotals: OrderSum;
  approved: Set<string>;
  approvedTotals: OrderSum;
  dispatch: (a: Action) => void;
  storeName: (id: string) => string;
  modelName: (id: string) => string;
  brandName: (id: string) => string;
  href: (path: string, extra?: Record<string, string | null>) => string;
  setLang: (l: Lang) => void;
  setParams: (patch: Record<string, string | null>) => void;
  params: URLSearchParams;
}

const Ctx = createContext<AppValue | null>(null);
const STORAGE_KEY = "gdf-state-v1";

export function AppStateProvider({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const lang: Lang = params.get("lang") === "en" ? "en" : "es";
  const present = params.get("present") === "1";
  const [state, dispatch] = useReducer(reducer, initial);
  const loaded = useRef(false);

  useEffect(() => {
    let next: PersistState = initial;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) next = { ...initial, ...JSON.parse(raw) };
    } catch {
      /* storage unavailable */
    }
    const fromUrl = scenarioFromParams(new URLSearchParams(window.location.search));
    if (fromUrl) next = { ...next, scenario: fromUrl };
    if (next !== initial) dispatch({ type: "load", state: next });
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable */
    }
  }, [state]);

  const engine = useMemo(() => new Engine(world, history, fc), []);
  const base = useMemo(() => engine.run(NEUTRAL), [engine]);
  // Light debounce so slider drags stay smooth. Every screen reads the same run.
  const [scn, setScn] = useState(state.scenario);
  useEffect(() => {
    if (scenarioKey(scn) === scenarioKey(state.scenario)) return;
    const id = setTimeout(() => setScn(state.scenario), 60);
    return () => clearTimeout(id);
  }, [state.scenario, scn]);
  const run = useMemo(() => engine.run(scn), [engine, scn]);
  const order = useMemo(() => computeOrder(engine, run, inventory, state.order), [engine, run, state.order]);
  const approved = useMemo(() => new Set(state.approved), [state.approved]);
  const orderTotals = useMemo(() => orderSummary(order.lines), [order]);
  const approvedTotals = useMemo(() => approvedSummary(order, approved), [order, approved]);

  const t = useCallback((key: DictKey | string, p?: Record<string, string | number>) => translate(lang, key, p), [lang]);
  const f = useMemo(() => makeFormat(lang), [lang]);
  const month = useCallback((tt: number, withYear = true) => monthLabel(lang, tt, withYear), [lang]);
  const storeMap = useMemo(() => Object.fromEntries(world.stores.map((s) => [s.id, s.name])), []);
  const modelMap = useMemo(() => Object.fromEntries(world.models.map((m) => [m.id, m.name])), []);
  const brandMap = useMemo(() => Object.fromEntries(world.brands.map((b) => [b.id, b.name])), []);

  const href = useCallback(
    (path: string, extra?: Record<string, string | null>) => {
      const q = new URLSearchParams();
      q.set("lang", lang);
      if (present) q.set("present", "1");
      for (const [k, v] of Object.entries(extra ?? {})) if (v !== null) q.set(k, v);
      return `${path}?${q.toString()}`;
    },
    [lang, present],
  );
  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const q = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) q.delete(k);
        else q.set(k, v);
      }
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );
  const setLang = useCallback((l: Lang) => setParams({ lang: l }), [setParams]);

  const value: AppValue = {
    lang,
    present,
    t,
    f,
    month,
    world,
    history,
    inventory,
    fc,
    backtest,
    engine,
    base,
    run,
    scenario: state.scenario,
    scenarioActive: !isNeutral(scn),
    saved: state.saved,
    orderSettings: state.order,
    order,
    orderTotals,
    approved,
    approvedTotals,
    dispatch,
    storeName: (id) => storeMap[id] ?? id,
    modelName: (id) => modelMap[id] ?? id,
    brandName: (id) => brandMap[id] ?? id,
    href,
    setLang,
    setParams,
    params,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { FlaskConical, X } from "lucide-react";
import { useApp } from "@/state/AppState";
import { GROUP_NAME } from "@/config";
import { translate } from "@/i18n";
import { palette } from "@/theme/tokens";
import { scenarioChips } from "./scenarioText";

export const NAV = [
  { path: "/", key: "nav.overview" },
  { path: "/explorador/", key: "nav.explorer" },
  { path: "/escenarios/", key: "nav.scenarios" },
  { path: "/pedido-sugerido/", key: "nav.order" },
  { path: "/como-funciona/", key: "nav.how" },
] as const;

export function Wordmark() {
  return (
    <div className="flex items-center gap-2 select-none" aria-label="Soothsayer Analytics">
      <svg width={26} height={26} viewBox="0 0 26 26" aria-hidden>
        <circle cx="13" cy="13" r="12" fill="none" stroke={palette.teal} strokeWidth="2" />
        <circle cx="13" cy="13" r="5" fill={palette.teal} />
        <circle cx="13" cy="13" r="2" fill={palette.navy} />
      </svg>
      <span className="leading-none whitespace-nowrap">
        <span className="font-semibold tracking-wide text-white text-[0.95rem]">Soothsayer</span>{" "}
        <span className="font-normal tracking-wide text-teal text-[0.95rem]">Analytics</span>
      </span>
    </div>
  );
}

function Header() {
  const { t, href, lang, setLang } = useApp();
  const pathname = usePathname() || "/";
  const norm = (p: string) => (p.endsWith("/") ? p : p + "/");
  return (
    <header className="header-gradient text-white shrink-0 shadow-[0_2px_10px_rgb(11_31_58/0.25)] relative z-30">
      <div className="flex items-stretch h-16 px-8 gap-6">
        <div className="flex items-center gap-5 shrink-0">
          <Wordmark />
          <div className="w-px h-8 bg-white/20" />
          <div className="leading-tight">
            <div className="text-[1.05rem] font-semibold whitespace-nowrap">{t("app.title")}</div>
            <div className="text-[0.8rem] text-white/70 whitespace-nowrap">{GROUP_NAME}</div>
          </div>
        </div>
        <nav className="flex items-stretch gap-0.5 ml-2">
          {NAV.map((n) => {
            const active = norm(pathname) === n.path;
            return (
              <Link
                key={n.path}
                href={href(n.path)}
                className={`flex items-center px-3.5 text-[0.95rem] border-b-[3px] transition-colors whitespace-nowrap ${
                  active ? "border-teal text-white font-semibold" : "border-transparent text-white/75 hover:text-white"
                }`}
              >
                {t(n.key)}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center rounded-full bg-white/10 p-[3px] ring-1 ring-white/15 text-[0.8rem] font-semibold" role="group" aria-label={t("lang.switch")}>
            {(["es", "en"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-3 py-[3px] rounded-full transition-colors ${lang === l ? "bg-teal text-navy shadow-sm" : "text-white/80 hover:text-white"}`}
                aria-pressed={lang === l}
              >
                {t(l === "es" ? "lang.es" : "lang.en")}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

/** Thin banner shown on every screen while a scenario is active, so numbers are never mistaken for the baseline. */
function ScenarioBanner() {
  const app = useApp();
  const pathname = usePathname() || "/";
  if (!app.scenarioActive || pathname.startsWith("/escenarios")) return null;
  return (
    <div className="shrink-0 bg-amber-soft border-b border-amber/40 px-8 h-9 flex items-center gap-3 text-[0.85rem] text-navy">
      <FlaskConical size={16} color={palette.amber} aria-hidden />
      <span className="font-semibold">{app.t("scenario.bannerActive")}</span>
      <span className="text-navy">{scenarioChips(app, app.scenario).join(" · ")}</span>
      {!app.present && (
        <button onClick={() => app.dispatch({ type: "resetScenario" })} className="ml-auto inline-flex items-center gap-1 font-semibold text-navy hover:underline">
          <X size={14} aria-hidden />
          {app.t("scenario.reset")}
        </button>
      )}
    </div>
  );
}

function Footer() {
  const { t, f, world } = useApp();
  return (
    <footer className="shrink-0 border-t border-line bg-surface px-8 h-8 flex items-center justify-between text-[0.75rem] text-muted">
      <span>{t("app.footer")}</span>
      <span className="tnum">{t("app.asOf", { date: f.date(world.asOf) })}</span>
    </footer>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { present, lang } = useApp();
  useEffect(() => {
    document.documentElement.classList.toggle("present", present);
    document.documentElement.lang = lang === "es" ? "es-MX" : "en";
  }, [present, lang]);
  return (
    <div className={present ? "w-[1600px] h-[900px] overflow-hidden flex flex-col bg-bg" : "min-h-screen min-w-[1280px] flex flex-col bg-bg"}>
      <Header />
      <ScenarioBanner />
      <main className="flex-1 min-h-0 flex flex-col">{children}</main>
      <Footer />
    </div>
  );
}

export function LoadingShell() {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="header-gradient h-16 px-8 flex items-center">
        <Wordmark />
      </header>
      <div className="flex-1 flex items-center justify-center text-muted">{translate("es", "app.loading")}</div>
    </div>
  );
}

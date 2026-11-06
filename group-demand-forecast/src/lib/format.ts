import type { Lang } from "@/i18n";

const locale = (lang: Lang) => (lang === "es" ? "es-MX" : "en-US");
const cache = new Map<string, Intl.NumberFormat>();
function nf(lang: Lang, key: string, opts: Intl.NumberFormatOptions) {
  const k = `${lang}|${key}`;
  let f = cache.get(k);
  if (!f) {
    f = new Intl.NumberFormat(locale(lang), opts);
    cache.set(k, f);
  }
  return f;
}

export function makeFormat(lang: Lang) {
  return {
    money: (x: number) => nf(lang, "money", { style: "currency", currency: "MXN", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(Math.round(x) === 0 ? 0 : x),
    /** Compact pesos: millions with separators (es "$2,185.6 M", en "$2.19B" or "$185.6M"). */
    moneyCompact: (x: number) => {
      const sign = x < 0 ? "-" : "";
      const a = Math.abs(x);
      const n0 = nf(lang, "c0", { maximumFractionDigits: 0 });
      const n1 = nf(lang, "c1", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      const n2 = nf(lang, "c2", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (lang === "en") {
        if (a >= 1e9) return `${sign}$${n2.format(a / 1e9)}B`;
        if (a >= 1e6) return `${sign}$${n1.format(a / 1e6)}M`;
        if (a >= 1e3) return `${sign}$${n0.format(a / 1e3)}K`;
        return `${sign}$${n0.format(a)}`;
      }
      if (a >= 1e6) return `${sign}$${n1.format(a / 1e6)} M`;
      if (a >= 1e3) return `${sign}$${n0.format(a / 1e3)} mil`;
      return `${sign}$${n0.format(a)}`;
    },
    moneySigned: (x: number) =>
      nf(lang, "moneySigned", { style: "currency", currency: "MXN", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(Math.round(x)),
    int: (x: number) => nf(lang, "int", { maximumFractionDigits: 0 }).format(x),
    dec1: (x: number) => nf(lang, "dec1", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(x),
    pct: (x: number) => nf(lang, "pct", { style: "percent", maximumFractionDigits: 0 }).format(x),
    pct1: (x: number) => nf(lang, "pct1", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(x),
    pct1Signed: (x: number) => nf(lang, "pct1Signed", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(x),
    pctSigned: (x: number) => nf(lang, "pctSigned", { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(x),
    date: (iso: string) =>
      new Intl.DateTimeFormat(locale(lang), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)),
    monthShort: (cal: number, year: number) =>
      new Intl.DateTimeFormat(locale(lang), { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(year, cal, 1))).replace(".", ""),
  };
}
export type Fmt = ReturnType<typeof makeFormat>;

/** Short month label for month index t (t = 0 is the first history month). */
export function monthLabel(lang: Lang, t: number, withYear = true): string {
  const k = 10 + t; // START month (November) + t
  const year = 2023 + Math.floor(k / 12);
  const month = k % 12;
  const s = new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", { month: "short", ...(withYear ? { year: "2-digit" } : {}), timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month, 1)))
    .replace(".", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function monthLong(lang: Lang, t: number): string {
  const k = 10 + t;
  const s = new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2023 + Math.floor(k / 12), k % 12, 1)));
  return s;
}

export function dayLabel(lang: Lang, asOf: string, offsetDays: number): string {
  const d = new Date(Date.parse(`${asOf}T00:00:00Z`) + offsetDays * 86400000);
  return new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(d).replace(".", "");
}

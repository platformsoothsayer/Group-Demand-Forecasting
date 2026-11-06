import es from "./es.json";
import en from "./en.json";

export type Lang = "es" | "en";
export type Dict = typeof es;
export type DictKey = keyof Dict;

const dicts: Record<Lang, Record<string, string>> = { es, en };

export function translate(lang: Lang, key: DictKey | string, params?: Record<string, string | number>): string {
  const raw = dicts[lang][key] ?? dicts.es[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, p: string) => (params[p] !== undefined ? String(params[p]) : `{${p}}`));
}

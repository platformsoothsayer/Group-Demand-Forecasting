/** WCAG contrast check for the token text pairs. Imported by verify.ts, also runnable alone. */
import { textPairs } from "../src/theme/tokens";

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
export function contrastResults() {
  return textPairs.map((p) => {
    const ratio = contrast(p.fg, p.bg);
    const need = p.large ? 3 : 4.5;
    return { ...p, ratio, need, ok: ratio >= need };
  });
}
if (require.main === module) {
  for (const r of contrastResults()) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.ratio.toFixed(2)} (need ${r.need}) ${r.label}`);
}

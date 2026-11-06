/**
 * Design tokens. The single source of every color in the app.
 * CSS variables are generated from this file (see cssVariables) and Tailwind maps to them in globals.css.
 */
export const palette = {
  navy: "#0B1F3A",
  deepTeal: "#0E7C86",
  teal: "#14A3A0",
  royal: "#2F6FDE",
  indigo: "#5B54C9",
  amber: "#E3A33B",
  coral: "#E0685A",
  green: "#2E9E6B",
  gold: "#B8925A",
  bg: "#F6F8FB",
  surface: "#FFFFFF",
  divider: "#E3E8EF",
  secondary: "#5B6B80",
} as const;

export type PaletteKey = keyof typeof palette;

/** Mix a token with white (amount = share of the token). Used only for tints of palette colors. */
export function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c * amount + 255 * (1 - amount)));
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Blend two tokens (t = share of b). */
export function blend(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ca = [(pa >> 16) & 255, (pa >> 8) & 255, pa & 255];
  const cb = [(pb >> 16) & 255, (pb >> 8) & 255, pb & 255];
  return `#${ca.map((c, i) => Math.round(c * (1 - t) + cb[i] * t).toString(16).padStart(2, "0")).join("")}`;
}

/** Brand colors: identical on every chart, chip, map node and legend. */
export const brandColor: Record<string, string> = {
  KAI: palette.teal,
  VAN: palette.royal,
  NOR: palette.indigo,
  SOL: palette.gold,
  ZHE: palette.coral,
  QIY: palette.green,
};

/** Diverging scale for growth vs decline, centered on zero: coral (decline) to white to teal (growth). */
export function divergingColor(v: number, span = 0.3): string {
  const t = Math.max(-1, Math.min(1, v / span));
  return t >= 0 ? tint(palette.teal, 0.08 + 0.72 * t) : tint(palette.coral, 0.08 + 0.72 * -t);
}

/** Trim mix (base, intermedia, tope): indigo ramp. */
export const trimColor = [tint(palette.indigo, 0.28), tint(palette.indigo, 0.6), palette.indigo];
/** Car paint swatches (blanco, plata, gris, negro, rojo, azul), all derived from palette tokens. */
export const carColor = [palette.surface, tint(palette.secondary, 0.28), tint(palette.secondary, 0.7), palette.navy, palette.coral, palette.royal];

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => {
    const v = x / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** Navy or white text, whichever has more contrast on the given fill. */
export function textOn(bg: string): string {
  const l = luminance(bg);
  const vsNavy = (l + 0.05) / (luminance(palette.navy) + 0.05);
  const vsWhite = 1.05 / (l + 0.05);
  return vsNavy >= vsWhite ? palette.navy : palette.surface;
}

/** Order flag and season colors. */
export const seasonColor = { buenFin: palette.amber, december: palette.deepTeal, january: palette.indigo } as const;

/** Semantic roles. */
export const semantic = {
  text: palette.navy,
  textSecondary: palette.secondary,
  actual: palette.navy, // actuals in every chart
  forecast: palette.teal, // forecast median and ranges
  forecastInk: palette.deepTeal,
  scenario: palette.amber, // scenario lines
  growth: palette.green,
  decline: palette.coral,
  luxury: palette.gold,
  gridline: palette.divider,
} as const;

/** Text and background pairs actually used for text. Checked for WCAG AA in npm run verify. */
export const textPairs: { fg: string; bg: string; label: string; large?: boolean }[] = [
  { fg: palette.navy, bg: palette.surface, label: "primary text on surface" },
  { fg: palette.navy, bg: palette.bg, label: "primary text on page" },
  { fg: palette.secondary, bg: palette.surface, label: "secondary text on surface" },
  { fg: palette.secondary, bg: palette.bg, label: "secondary text on page" },
  { fg: palette.deepTeal, bg: palette.surface, label: "action text on surface" },
  { fg: palette.deepTeal, bg: palette.bg, label: "action text on page" },
  { fg: palette.royal, bg: palette.surface, label: "royal blue text on surface" },
  { fg: palette.indigo, bg: palette.surface, label: "indigo text on surface" },
  { fg: palette.surface, bg: palette.navy, label: "header text on navy" },
  { fg: palette.surface, bg: palette.deepTeal, label: "button text on deep teal" },
  { fg: palette.navy, bg: palette.teal, label: "segmented control active" },
  { fg: palette.navy, bg: palette.amber, label: "text on amber" },
  { fg: palette.navy, bg: palette.coral, label: "text on coral" },
  { fg: palette.navy, bg: tint(palette.amber, 0.22), label: "proposed chip" },
  { fg: palette.navy, bg: tint(palette.coral, 0.2), label: "risk chip" },
  { fg: palette.navy, bg: tint(palette.green, 0.18), label: "gain chip" },
  { fg: palette.navy, bg: tint(palette.teal, 0.16), label: "action tint" },
  { fg: palette.navy, bg: divergingColor(0.3), label: "heatmap cell, strongest growth" },
  { fg: palette.navy, bg: divergingColor(-0.3), label: "heatmap cell, strongest decline" },
  { fg: palette.navy, bg: tint(palette.gold, 0.25), label: "new brand heatmap cell" },
  { fg: palette.navy, bg: tint(palette.indigo, 0.16), label: "january flag chip" },
  ...[...trimColor, ...carColor].map((c, i) => ({ fg: textOn(c), bg: c, label: `mix bar label ${i}` })),
  { fg: palette.navy, bg: tint(palette.deepTeal, 0.16), label: "december flag chip" },
  { fg: palette.surface, bg: blend(palette.navy, palette.deepTeal, 0.28), label: "header text on gradient end" },
  { fg: palette.green, bg: palette.surface, label: "growth value (large)", large: true },
  { fg: palette.coral, bg: palette.surface, label: "decline value (large)", large: true },
];

/** CSS custom properties generated from the tokens. */
export function cssVariables(): string {
  const v: Record<string, string> = {
    "--c-navy": palette.navy,
    "--c-deep-teal": palette.deepTeal,
    "--c-teal": palette.teal,
    "--c-teal-soft": tint(palette.teal, 0.12),
    "--c-royal": palette.royal,
    "--c-indigo": palette.indigo,
    "--c-amber": palette.amber,
    "--c-amber-soft": tint(palette.amber, 0.22),
    "--c-coral": palette.coral,
    "--c-coral-soft": tint(palette.coral, 0.2),
    "--c-green": palette.green,
    "--c-green-soft": tint(palette.green, 0.18),
    "--c-gold": palette.gold,
    "--c-bg": palette.bg,
    "--c-surface": palette.surface,
    "--c-divider": palette.divider,
    "--c-divider-soft": tint(palette.divider, 0.55),
    "--c-secondary": palette.secondary,
    "--c-gold-soft": tint(palette.gold, 0.25),
    "--c-indigo-soft": tint(palette.indigo, 0.16),
    "--c-royal-soft": tint(palette.royal, 0.14),
  };
  return `:root{${Object.entries(v).map(([k, x]) => `${k}:${x}`).join(";")}}`;
}

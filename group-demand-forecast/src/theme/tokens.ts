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

/** Aging ramp: light teal (0-30) through amber (61-90) to coral (90+). */
const lightTeal = tint(palette.teal, 0.42);
export const agingRamp = [lightTeal, blend(lightTeal, palette.amber, 0.55), palette.amber, palette.coral] as const;

/** Semantic roles. */
export const semantic = {
  text: palette.navy,
  textSecondary: palette.secondary,
  action: palette.deepTeal, // recommended action, approved
  actionBright: palette.teal,
  proposed: palette.amber,
  risk: palette.coral,
  gain: palette.green,
  cost: palette.coral,
  net: palette.teal,
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
  ...agingRamp.map((c, i) => ({ fg: palette.navy, bg: c, label: `aging bucket ${i} label` })),
  { fg: palette.green, bg: palette.surface, label: "savings KPI value (large)", large: true },
  { fg: palette.deepTeal, bg: palette.surface, label: "plan KPI value (large)", large: true },
  { fg: palette.coral, bg: palette.surface, label: "loss value (large)", large: true },
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
    "--c-a0": agingRamp[0],
    "--c-a1": agingRamp[1],
    "--c-a2": agingRamp[2],
    "--c-a3": agingRamp[3],
  };
  return `:root{${Object.entries(v).map(([k, x]) => `${k}:${x}`).join(";")}}`;
}

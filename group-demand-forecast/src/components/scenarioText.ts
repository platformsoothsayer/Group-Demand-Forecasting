import type { AppValue } from "@/state/AppState";
import type { Scenario } from "@/lib/scenario";

/** Short labels describing a scenario, built from dictionary templates. */
export function scenarioChips(app: Pick<AppValue, "t" | "f" | "brandName" | "month" | "fc">, s: Scenario): string[] {
  const { t, f } = app;
  const out: string[] = [];
  const sign = (x: number) => (x > 0 ? `+${f.dec1(x).replace(/[.,]0$/, "")}` : f.dec1(x).replace(/[.,]0$/, ""));
  if (s.credit) out.push(t("scenario.chip.credit", { v: sign(s.credit) }));
  if (s.fuel) out.push(t("scenario.chip.fuel", { v: sign(s.fuel) }));
  if (s.confidence) out.push(t("scenario.chip.confidence", { v: sign(s.confidence) }));
  if (s.leads) out.push(t("scenario.chip.leads", { v: sign(s.leads) }));
  if (s.campaign.brand && s.campaign.depth)
    out.push(
      t("scenario.chip.campaign", {
        brand: app.brandName(s.campaign.brand),
        v: f.dec1(s.campaign.depth).replace(/[.,]0$/, ""),
        from: app.month(app.fc.tEnd + 1 + s.campaign.start, false),
        n: s.campaign.months,
      }),
    );
  return out;
}

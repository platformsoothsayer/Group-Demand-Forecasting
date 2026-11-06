"use client";
import type { AppValue } from "@/state/AppState";
import type { Sentence } from "@/lib/explain";

/** Turn computed sentences into text. Percent parameters are formatted as percents, units as whole numbers. */
export function renderSentences(app: Pick<AppValue, "t" | "f">, sentences: Sentence[]): string {
  return sentences
    .map((s) => {
      const p: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(s.params)) {
        if (typeof v !== "number") p[k] = v;
        else if (k === "pct") p[k] = app.f.pct(v);
        else p[k] = app.f.int(v);
      }
      return app.t(s.key, p);
    })
    .join(" ");
}

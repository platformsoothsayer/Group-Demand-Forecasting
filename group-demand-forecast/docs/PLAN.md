# Build plan

Companion world reused from `group-inventory-optimizer`: dealerships, brands, models, MSRP, cost ratios,
trims, colors, seed (20261105), design tokens, header and wordmark, and its on-hand inventory snapshot.

## Time axis
- History index t = 0..35 is Nov 2023 .. Oct 2026. AS_OF = 2026-11-01.
- Forecast t = 36..41 is Nov 2026 .. Apr 2027.

## Files
- `scripts/world-def.ts` world constants (shared with the companion) and truth parameters (generator only)
- `scripts/generate-data.ts` truth process -> `src/data/world.json`, `history.json`, `inventory.json`
- `scripts/fit-models.ts` fits everything at build time -> `src/data/forecast.json`, `backtest.json`
- `src/lib/` pure TypeScript, no UI
  - `linalg.ts` small dense matrix helpers
  - `model.ts` design matrix, penalized NB IRLS, two-level empirical Bayes pooling, analog cold start, sample paths
  - `mix.ts` smoothed multinomial logit with trend for trim and color shares
  - `reconcile.ts` hierarchy (S matrix), OLS structural reconciliation of means and paths
  - `engine.ts` browser runtime: decode paths, apply scenario, aggregate any node, quantiles
  - `scenario.ts` scenario factors from fitted elasticities (neutral = exactly 1)
  - `ordering.ts` order-up-to suggested order with quantile safety stock, season flags, plan piso
  - `explain.ts` LMDI driver decomposition and generated sentences
  - `backtest.ts` rolling-origin evaluation vs seasonal naive and 3-month moving average
- `src/i18n/es.json`, `en.json` all copy
- `src/state/AppState.tsx` context + useReducer (selection, scenario, saved scenarios, ordering, approvals)
- `scripts/verify.ts`, `scripts/contrast.ts`, `scripts/screenshots.cjs`

## Data shapes
- Bottom series = dealership x model (73). Upper nodes: group, brand, model, dealership x brand.
- `forecast.json`: per bottom series integer sample paths [6 months x 500], reconciliation shift [6],
  scenario coefficients, log driver components (t = 33..41), mix shares by month, cold start info.
- `inventory.json`: lines dealership x model x trim x color with on hand and in transit.

## Module boundaries
generate -> fit (model, mix, reconcile, backtest) -> JSON -> engine (scenario) -> ordering / explain -> UI.
UI never does model math. Node scripts import the same modules.

# Group Demand Forecast (demo)

Bilingual (ES default, EN) demo of AI demand forecasting for a fictional multi-location car dealer group in Mexico.
Sample data only. Built by Soothsayer Analytics. Same fictional world, seed and design tokens as the companion
`group-inventory-optimizer` demo.

```bash
npm install
npm run dev          # generates data, fits the models, starts Next.js
npm run verify       # reconciliation, quantiles, scenarios, ordering, stories, backtest, determinism, copy checks
npm run lint
npm run build        # regenerates and refits (prebuild), then static export to out/
npm run screenshots  # 1600x900 ?present=1 screenshots in screenshots/es and screenshots/en, plus an e2e approval check
```

URL options: `?lang=es|en`, `?present=1` (fixed 1600x900 canvas, larger type, no animation).
Explorer deep links: `/explorador/?brand=QIY&store=QRO`, `?model=K3`. Scenario links: `/escenarios/?credit=2`
(also `fuel`, `conf`, `leads`, `camp=KAI:5:0:2`). Order view: `/pedido-sugerido/?store=SAT&open=SAT:KX3`.

## How it is built
- `scripts/world-def.ts`, `scripts/generate-data.ts`: seeded synthetic world (truth process, planted stories) -> `src/data/{world,history,inventory}.json`
- `scripts/fit-models.ts`: all fitting at build time -> `src/data/{forecast,backtest}.json`
- `src/lib/` pure TypeScript, no UI: `model.ts` (penalized NB IRLS, two-level empirical Bayes, analog cold start with
  Bayesian model averaging, sample paths), `mix.ts`, `reconcile.ts` (OLS structural), `engine.ts`, `scenario.ts`,
  `ordering.ts`, `explain.ts` (LMDI decomposition), `backtest.ts` (rolling origin), `kpis.ts`
- `src/i18n/es.json`, `src/i18n/en.json`: all copy
- `docs/PLAN.md`: build plan. `docs/verify-output.txt`: latest verification run.

## Notes and assumptions
- P50 shown everywhere is the central forecast, the mean of the reconciled sample paths. Means add up across levels,
  true medians do not, so the mean keeps every level coherent. P10 to P90 come from the coherent paths.
- Safety stock is the service-level quantile of dealership x model window demand across the paths, split to trim and
  color lines by the forecast mix (buyers accept a near configuration). Line orders are rounded by largest remainder
  within each dealership x model.
- Credit sensitivity is estimated as one pooled coefficient times each segment's financed share (a known F&I input).
- Market indicators are illustrative sample series. In the backtest they are held at their last value after each cutoff.

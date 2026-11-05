# RASAD prototype (Route-Aware Supply Anticipation & Dispatch)

Team FOCUSX · Redstone Rush (NEXSUS) · CONTINUUM 2027

## Run it
Open `index.html` in any modern browser (Chrome, Edge, Firefox). No install, no server.
Fonts load from Google Fonts when online; offline it falls back to system fonts.

## What it shows
- **Operations tab:** sector map of 10 forward posts, 2 depots, 5 passes. Click a post to see its
  supply clock vs route clock, stock per item, and a 30-day forecast.
- **Dispatch plans:** generated for red/orange/amber posts. Each plan passes guardrail checks
  (route open, load within capacity, vehicles free today, fits post storage) before you approve it.
- **Test a guardrail:** creates an unsafe plan (truck through a shut pass, or overload) and shows it blocked.
- **Next day / +7 days / Inject snowstorm:** move time forward and change the weather.
- **Ask RASAD:** planner assistant. In this prototype it runs on rules in the browser; the full build
  uses a local open-weight LLM calling the same tools.
- **Backtest tab:** the same winter (1 Oct to 30 Mar) run twice, fixed calendar vs RASAD.

## Two-clock rule
A post turns RED when days of stock < days to road closure + expected closure length.

## Files
- `index.html`: the complete app in one file (open this).
- `src/engine.js`: simulation and logic (weather, demand forecast, route risk, planner, validator, backtest).
  Also runs in Node: `node -e "const R=require('./src/engine.js'); console.log(R.runSeason(42,'rasad').metrics)"`
- `src/app.js`: user interface code.
- `src/styles.css`: styles.

## Data
All data is synthetic: post names, pass names, weather and stock levels are invented for the demo.
No official or classified data is used.

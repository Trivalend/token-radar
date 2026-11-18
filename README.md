# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Trivalend/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Trivalend/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar that ranks pre-token DeFi protocols by implied value from a sealed DefiLlama snapshot. The board holds 198 rows — a 40-protocol watchlist (TVL ≥ $50M, no token recorded) plus the early rows below the floor — each with an 8-step farm plan, and a sortable, filterable dashboard shows the board with a detail view per protocol.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

Two runs write the same bytes. The program (`main.ts`, Node 22, standard library only) reads the sealed DefiLlama snapshot, scores every pre-token protocol with the radar-2 model, and writes the ranked board to `/output/board.json`, the dashboard's data to `/output/data.js`, the dashboard itself to `/output/dashboard/`, the screenshots to `/output/screenshots/`, and the dossier to `/output/dossier.json`.

## The model (radar-2)

One function scores every row, from the snapshot's own figures only. No protocol name is special-cased.

- Implied value = TVL × a size tier (0.22 below $100M, 0.25 to $1B, 0.28 above $1B) × a saturating growth factor from the seven-day change (1 + 0.55 × tanh(clamped change / 45)) × a maturity factor from the days since first listed (0.55 + 0.45 × age / (age + 365)) × a chain-breadth factor (1 + 0.04 × min(chains − 1, 5)), rounded to whole dollars.
- The board holds every protocol that passes the watchlist's own no-token test, the $50M floor aside: 40 watchlist rows and the early rows below the floor. Protocols that record a token are set aside in a separate live-token view, never mixed into the board.
- Each row carries an 8-step farm plan with what each step costs and how long it takes, derived from the protocol's category, TVL-sized capital, chains and age.

The dashboard (`dashboard/`) is a sortable, filterable board with a detail drawer per protocol; it renders the numbers `board.json` carries and never recomputes the model, so the page and the board cannot drift apart.

## Files

- `main.ts` — entrypoint.
- `lib/model.ts` — the radar-2 model, the board rule and the farm plans.
- `vendor/makefun-board.ts` — the kit's dossier builder (kit-provided).
- `dashboard/` — index.html, app.css, app.js.
- `screenshots/` — the three dashboard screenshots.

---

<sub>Entered on [make.fun](https://make.fun/?ref=6pmtqpwy&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

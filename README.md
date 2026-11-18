# Token Radar

A token launch radar: it finds the protocols whose token does not exist yet,
ranks them by an implied value, and shows how to farm each one.

The program (`main.ts`, Node 22, standard library only) reads the sealed
DefiLlama snapshot at `/input/snapshot.json`, scores every pre-token
protocol with the radar-2 model, and writes the ranked board to
`/output/board.json`, the dashboard's data to `/output/data.js`, the
dashboard itself to `/output/dashboard/`, the screenshots to
`/output/screenshots/`, and the dossier to `/output/dossier.json`.

## The model (radar-2)

One function scores every row, from the snapshot's own figures only. No
protocol name is special-cased.

- Implied value = TVL × a size tier (0.22 below $100M, 0.25 to $1B, 0.28
  above $1B) × a saturating growth factor from the seven-day change
  (1 + 0.55 × tanh(clamped change / 45)) × a maturity factor from the days
  since first listed (0.55 + 0.45 × age / (age + 365)) × a chain-breadth
  factor (1 + 0.04 × min(chains − 1, 5)), rounded to whole dollars.
- The board holds every protocol that passes the watchlist's own no-token
  test, the $50M floor aside: 40 watchlist rows and the early rows below the
  floor. Protocols that record a token are set aside in a separate live-token
  view, never mixed into the board.
- Each row carries an 8-step farm plan with what each step costs and how
  long it takes, derived from the protocol's category, TVL-sized capital,
  chains and age.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

Two runs write the same bytes. The dashboard (`dashboard/`) is a sortable,
filterable board with a detail drawer per protocol; it renders the numbers
`board.json` carries and never recomputes the model, so the page and the
board cannot drift apart.

## Files

- `main.ts` — entrypoint.
- `lib/model.ts` — the radar-2 model, the board rule and the farm plans.
- `vendor/makefun-board.ts` — the kit's dossier builder (kit-provided).
- `dashboard/` — index.html, app.css, app.js.
- `screenshots/` — the three dashboard screenshots.

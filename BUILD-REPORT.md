# Token Radar — Build Report (token-radar-01)

Entry directory: `~/workspace/makefun/token-radar-entry/` — built from the kit starter, model and
dashboard rewritten. Deadline: 14 Dec 2026 17:00 WIB. Free entry, $1,325 USDC pot
(1st $1,000, 2nd–5th $50, 6th–10th $25).

## Model (radar-2)

One function scores every row, from the snapshot's own figures only. No protocol name is
special-cased.

```
implied = round( tvl_usd x tier(tvl)
               x (1 + 0.55 x tanh(clamp(change_7d, -50, 150) / 45))
               x (0.55 + 0.45 x age_days / (age_days + 365))
               x (1 + 0.04 x min(chains - 1, 5)) )
tier(tvl): 0.22 below $100M, 0.25 to $1B, 0.28 above $1B
```

- **Tier:** a launch multiple anchored to TVL; a larger, proven protocol commands a higher multiple.
- **Growth:** smooth, saturating tanh — a +150% week is worth 1.55x, a -50% week 0.56x, never more
  (the snapshot's 7-day changes run from -72.7% to +4,448%, so saturation matters).
- **Maturity:** an S-curve on days since first listed — a year of running with no token earns most
  of the credit, then it flattens. Unknown age uses 365 days.
- **Breadth:** a small secondary signal for protocols live on more chains, capped at +20%.

Board rule: every protocol that passes the watchlist's own no-token test, the floor aside —
pre-token, not a wrapped/staked/bridged product, not an exchange, not a versioned pool. The
40 above the $50M floor are the watchlist; the 138 below it are the early radar. Live-token
protocols (32, by market cap) are set aside in a separate Live token view, never mixed in.
The page says "records no token", never "has no token".

## Board

- **178 rows** (40 watchlist + 138 early), ranks 1..178, all implied values distinct.
- Top 5: Steakhouse Financial $737.6M · Gauntlet $464.0M · Veda $394.8M · USDD $256.4M ·
  Upshift $139.6M. Bottom: Monarq $0.55M. Implied range $549,754 – $737,647,334.
- Farm plans: **8 steps per row**, 124–297 chars trimmed each, derived from the protocol's
  category (two actions), TVL (capital), chains (cross-chain step), age (hold days); every step
  carries a cost in USD/gas and a time.

## Gate — all 7 rows PASS (verified with /tmp/shot/verify.mjs, 12/12 checks)

| Gate row | Result | Numbers |
|---|---|---|
| dashboard_files | PASS | 3 files, 36,139 bytes; index.html + app.css + app.js; no http(s) anywhere |
| board_file | PASS | 178 rows, 340,256 bytes; all slugs in snapshot, no dups, all values valid |
| sorted_by_value | PASS | ranks exactly 1..178, implied non-increasing, 178 distinct values |
| coverage | PASS | all 40 watchlist slugs present |
| farm_steps | PASS | 8 steps/row, 124–297 chars trimmed, 0 out of range |
| screenshots | PASS | 3 JPEGs, 1440x900 each (see below) |
| dossier_matches | PASS | regenerated dossier byte-identical to out/dossier.json (1,303,443 bytes) |

Extra checks, all PASS: dashboard source 36,139 bytes (< 64 KB cap); implied values
re-derived independently from the snapshot for all 178 rows (0 mismatches); second run is
byte-identical (board + dossier); the page's detail view farm steps match board.json for
4 sampled rows (ranks 1, 50, 100, 178); Live token tab renders 32 rows, no page errors.

## Screenshots (screenshots/, captured with Playwright Chromium at 1440x900)

| File | View | Size |
|---|---|---|
| 1-board.jpg | Board, default view | 306,923 B |
| 2-detail.jpg | Detail view, rank 1 (Steakhouse Financial) | 332,504 B |
| 3-filtered.jpg | Filtered view, category = Risk Curators (33 rows) | 309,998 B |

## Bugs found and fixed during the build

1. The starter's `capitalFor` differed between `lib/model.ts` (5e9/1e9/1e8 tiers) and
   `dashboard/app.js` (1e9/1e8/5e7 tiers), so the page's farm plan disagreed with board.json
   for protocols in the $50M–$100M and $1B–$5B bands. Fixed `app.js` to match `model.ts`
   exactly; verified the page's steps now match board.json.
2. Playwright `page.goto` with only a hash change does not reload the page, so the first
   screenshot pass produced three identical images. The capture script now navigates to
   `about:blank` first.

## How to run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

Node v24.22.1. No network, no install. Screenshots were captured with Playwright Chromium
(headless shell 159.0.8154.6, installed via `npx playwright-core install chromium` in
/tmp/shot); the capture script is /tmp/shot/shots.mjs, the verifier /tmp/shot/verify.mjs.

## Left for submission (not done here, by design)

- Nothing is submitted and no GitHub repo was created by this build.
- Next steps for the parent: push this directory to the public repo Trivalend/token-radar
  (after the Muse GitHub App is installed on it), bundle the agent transcripts, run
  `node cli/makefun.mjs check`, then submit before 14 Dec 2026 17:00 WIB.
- Note: the dossier's cover image is 1-board.jpg, which will show publicly on make.fun's
  Feed once the entry is judged.

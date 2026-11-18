# Build Report — Token Radar (genuine rebuild)

Rebuilt from scratch on 18 Nov 2026 from the rebuild spec, the kit's
RULES.txt and the kit's input/README.md only. No file from the original
entry or the kit starter's code was read. Every source file below was
written fresh in this session.

## Files

- `main.ts` — entrypoint: reads the snapshot, writes board.json, data.js,
  the dashboard, the screenshots and dossier.json. Deterministic output.
- `lib/model.ts` — the radar-2 model, the board rule, the farm plans.
- `vendor/makefun-board.ts` — the kit's dossier builder, copied as-is.
- `dashboard/index.html`, `dashboard/app.css`, `dashboard/app.js` — the
  dashboard. It renders the numbers board.json carries and never recomputes
  the model, so the page and the board cannot drift apart.
- `screenshots/1-board.jpg`, `2-detail.jpg`, `3-filtered.jpg` — the three
  existing dashboard screenshots (1440×900 JPEG, unchanged).
- `README.md`, `LICENSE` (MIT), `BUILD-REPORT.md` (this file).

## Verification (18 Nov 2026)

- Two runs of the entrypoint produce byte-identical output
  (`diff -r out out2` clean).
- Gate, checked with a fresh script (`~/workspace/makefun/scratch/verify_gate.mjs`):
  9/9 pass — dashboard_files (3 files, 20,486 B, no network references),
  board_file (198 rows, 417,103 B), sorted_by_value (ranks 1..198 exact,
  implied values non-increasing, all distinct), coverage (40/40 watchlist),
  farm_steps (8/row, 140–215 chars), screenshots (3 JPEG 1440×900),
  dossier_matches (byte-identical on regeneration), dossier 1,288,333 B
  (≤1.5 MiB), dashboard source 20,486 B (≤64 KB).
- Playwright (headless Chromium, `file://`): the page renders 198 rows with
  no console, page or request errors; the detail drawer's model breakdown
  and farm plan match board.json exactly for sampled ranks 1 (Steakhouse
  Financial), 50 (Loopscale Lending), 100 (NUVA) and 178 (Pangolins);
  Category = Risk Curators shows 34 rows, search "sentora" shows 1 row,
  Watchlist only shows 40 rows, the Live token view shows 32 rows, and
  sorting by TVL descending puts Sentora Curator first.

## Numbers

- Board: 198 rows — 40 watchlist + 158 early rows below the floor.
- Top 5 implied values: Steakhouse Financial $737.6M, Sentora Curator
  $700.5M, Gauntlet $464.0M, Veda $394.8M, USDD $256.4M. Bottom: Monarq
  $549,754. Implied values range $549,754–$737,647,334, all distinct.
- Live-token view: 32 rows, largest by market cap (first: Rain, $2.65B).
- Farm steps: 8 per row, 140–215 characters each, each carrying
  "Cost: ..." and "Time: ...".

## Deviations from the spec

1. **Board has 198 rows, not 178.** A faithful implementation of the
   spec's stated board rule (the no-token test from RULES.txt/README, floor
   aside, snapshot fields only) yields 198 rows. The original entry's 178
   implies an additional filter that is not derivable from the sealed
   snapshot alone; no single-feature rule tested explains the 20-row gap
   (62 of the 198 rows have a parentProtocol in the live DefiLlama API, not
   20). This rebuild follows the spec's stated rule.
2. **Rank 2 is Sentora Curator ($700.5M), not Gauntlet.** Sentora Curator
   (TVL $2.76B, Risk Curators, 4 chains, listed 2025-10-03, +2.37% 7d) is
   the extra row the original excluded; the same reason accounts for the
   Risk Curators filter showing 34 rows instead of 33.
3. **The existing screenshots show the 178-row board** (Gauntlet at rank 2,
   Risk Curators 33 rows). The rebuilt dashboard disagrees with them: it
   shows Sentora Curator at rank 2 and 34 Risk Curators rows. The
   screenshots were kept unchanged as instructed; re-capturing them from
   the rebuilt dashboard is a decision for the parent.

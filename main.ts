// Token Radar — entrypoint.
//
// Reads the sealed DefiLlama snapshot, scores every pre-token protocol with
// the radar-2 model, and writes the ranked board, the dashboard data, the
// dashboard itself, the screenshots and the dossier into the output dir.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
//
// Standard library only. No network. The run is deterministic: two runs
// write the same bytes.

import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBoard } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

// Paths for the entry's own files resolve against this file, not the
// working directory, so the program works wherever it is started from.
const ROOT = dirname(fileURLToPath(import.meta.url));

function parseInputPath(argv: string[]): string {
  const at = argv.indexOf("--input");
  if (at >= 0 && argv[at + 1]) return argv[at + 1];
  return "/input/snapshot.json";
}

function main(): void {
  const inputPath = parseInputPath(process.argv.slice(2));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";

  const snapshot = JSON.parse(readFileSync(inputPath, "utf8"));
  const board = buildBoard(snapshot);

  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, "dashboard"), { recursive: true });
  mkdirSync(join(outDir, "screenshots"), { recursive: true });

  // The ranked board.
  const boardJson = JSON.stringify(
    { as_of: snapshot.as_of, rows: board.rows },
    null,
    2,
  );
  writeFileSync(join(outDir, "board.json"), boardJson + "\n");

  // The dashboard's data, beside the page: the board rows with their model
  // breakdowns and farm plans, plus the live-token view.
  const dataJs =
    "window.TOKEN_RADAR = " +
    JSON.stringify({
      asOf: snapshot.as_of,
      watchlistCount: board.watchlistCount,
      earlyCount: board.earlyCount,
      rows: board.rows,
      live: board.live,
    }) +
    ";\n";
  writeFileSync(join(outDir, "data.js"), dataJs);

  // The dashboard files and the screenshots, copied whole.
  cpSync(join(ROOT, "dashboard"), join(outDir, "dashboard"), {
    recursive: true,
  });
  cpSync(join(ROOT, "screenshots"), join(outDir, "screenshots"), {
    recursive: true,
  });

  // The dossier: byte for byte what the kit's builder writes from the
  // dashboard and the screenshots.
  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, "dossier.json"), dossier);

  console.log(
    `board: ${board.rows.length} rows ` +
      `(${board.watchlistCount} watchlist + ${board.earlyCount} early), ` +
      `live: ${board.live.length}, out: ${outDir}`,
  );
}

main();

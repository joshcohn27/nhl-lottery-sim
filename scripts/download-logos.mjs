#!/usr/bin/env node
// Downloads and self-hosts the 32 current NHL team logos (light-background
// variant) into public/logos/{ABBREV}.svg, so the site never depends on the
// NHL's asset URLs staying stable. Run manually whenever a team rebrands
// (e.g. `node scripts/download-logos.mjs`) - this isn't part of the daily
// standings cron since logos change extremely rarely.

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "public", "logos");
const STANDINGS_URL = "https://api-web.nhle.com/v1/standings/now";

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const response = await fetch(STANDINGS_URL, { headers: { "User-Agent": "nhl-lottery-sim-logo-downloader" } });
  if (!response.ok) throw new Error(`standings fetch failed: HTTP ${response.status}`);

  const data = await response.json();
  const rows = Array.isArray(data?.standings) ? data.standings : [];
  if (rows.length !== 32) throw new Error(`expected 32 teams, got ${rows.length}`);

  let ok = 0;
  const failures = [];

  for (const row of rows) {
    const abbrev = row.teamAbbrev?.default;
    const logoUrl = row.teamLogo; // light-background variant, per the live standings response
    if (!abbrev || !logoUrl) {
      failures.push(`${abbrev ?? "?"}: missing abbrev or teamLogo URL`);
      continue;
    }

    try {
      const svgResponse = await fetch(logoUrl);
      if (!svgResponse.ok) throw new Error(`HTTP ${svgResponse.status}`);
      const svg = await svgResponse.text();
      if (!svg.trim().startsWith("<")) throw new Error("response wasn't SVG");

      await writeFile(path.join(OUTPUT_DIR, `${abbrev}.svg`), svg);
      ok++;
    } catch (err) {
      failures.push(`${abbrev}: ${err.message}`);
    }
  }

  console.log(`download-logos: wrote ${ok}/32 logos to public/logos/.`);
  if (failures.length > 0) {
    console.error("download-logos: failures:\n" + failures.map((f) => `  - ${f}`).join("\n"));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("download-logos: fatal error:", err);
  process.exitCode = 1;
});

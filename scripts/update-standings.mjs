#!/usr/bin/env node
// Fetches the live NHL standings and writes public/data/standings.json for the
// sim to read. Never overwrites a good file with a bad/empty one - on any
// failure or preseason condition it leaves the existing file alone and exits 0.
//
// Usage: node scripts/update-standings.mjs
// Schedule: see .github/workflows/update-standings.yml (runs daily, checks the
// America/New_York hour itself since GitHub Actions cron is UTC-only).

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "..", "public", "data", "standings.json");
const STANDINGS_URL = "https://api-web.nhle.com/v1/standings/now";

// Keep in sync with src/lib/config.ts (DRAFT_YEAR / NHL_SEASON_ID). Duplicated
// here because this plain Node script doesn't share a build step with the TS app.
const DRAFT_YEAR = 2027;
const SEASON_START_YEAR = DRAFT_YEAR - 1;
const EXPECTED_SEASON_ID = Number(`${SEASON_START_YEAR}${DRAFT_YEAR}`);

// Our display-name convention (matches prospects.csv / pick-trades.json / the
// archived 2026 data), keyed by the NHL API's team abbreviation.
const NAME_BY_ABBREV = {
  ANA: "Anaheim", BOS: "Boston", BUF: "Buffalo", CGY: "Calgary", CAR: "Carolina",
  CHI: "Chicago", COL: "Colorado", CBJ: "Columbus", DAL: "Dallas", DET: "Detroit",
  EDM: "Edmonton", FLA: "Florida", LAK: "Los Angeles", MIN: "Minnesota",
  MTL: "Montreal", NSH: "Nashville", NJD: "New Jersey", NYI: "NY Islanders",
  NYR: "NY Rangers", OTT: "Ottawa", PHI: "Philadelphia", PIT: "Pittsburgh",
  SJS: "San Jose", SEA: "Seattle", STL: "St. Louis", TBL: "Tampa Bay",
  TOR: "Toronto", UTA: "Utah", VAN: "Vancouver", VGK: "Vegas",
  WSH: "Washington", WPG: "Winnipeg",
};

// Same tiebreaker order as src/lib/standings.ts: points% -> RW -> ROW -> wins.
function compareWorstFirst(a, b) {
  return (
    a.pointPctg - b.pointPctg ||
    a.regulationWins - b.regulationWins ||
    a.row - b.row ||
    a.wins - b.wins ||
    a.name.localeCompare(b.name)
  );
}

async function readExistingFile() {
  try {
    return JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  } catch {
    return null;
  }
}

function keepLastGood(reason, existing) {
  console.warn(`update-standings: ${reason} - keeping last good file.`);
  if (!existing) {
    console.warn("update-standings: no existing file to keep; nothing written.");
  }
  process.exit(0);
}

function currentHourInNewYork() {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  }).format(new Date());

  // "24" shows up at midnight with hour12: false in some ICU builds - normalize to 0.
  return Number(hourStr) % 24;
}

async function main() {
  if (process.env.FORCE_RUN !== "true" && currentHourInNewYork() !== 0) {
    console.log("update-standings: not midnight in America/New_York yet - skipping this run.");
    return;
  }

  const existing = await readExistingFile();

  let response;
  try {
    response = await fetch(STANDINGS_URL, { headers: { "User-Agent": "nhl-lottery-sim-standings-updater" } });
  } catch (err) {
    return keepLastGood(`fetch failed (${err.message})`, existing);
  }

  if (!response.ok) {
    return keepLastGood(`fetch returned HTTP ${response.status}`, existing);
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    return keepLastGood(`response was not valid JSON (${err.message})`, existing);
  }

  const rows = Array.isArray(data?.standings) ? data.standings : [];

  if (rows.length === 0) {
    return keepLastGood("response had no standings rows", existing);
  }

  const seasonId = rows[0]?.seasonId;
  if (seasonId !== EXPECTED_SEASON_ID) {
    return keepLastGood(
      `response is for season ${seasonId}, expected ${EXPECTED_SEASON_ID} (offseason/wrong season)`,
      existing
    );
  }

  const anyGamesPlayed = rows.some((row) => (row.gamesPlayed ?? 0) > 0);
  if (!anyGamesPlayed) {
    return keepLastGood("season hasn't started yet (all teams at 0 games played)", existing);
  }

  if (rows.length !== 32) {
    return keepLastGood(`expected 32 teams, got ${rows.length}`, existing);
  }

  let teams;
  try {
    teams = rows.map((row) => {
      const abbrev = row.teamAbbrev?.default;
      const name = NAME_BY_ABBREV[abbrev];
      if (!name) throw new Error(`unrecognized team abbrev "${abbrev}"`);

      return {
        abbrev,
        name,
        gamesPlayed: row.gamesPlayed ?? 0,
        points: row.points ?? 0,
        pointPctg: row.pointPctg ?? 0,
        regulationWins: row.regulationWins ?? 0,
        row: row.regulationPlusOtWins ?? 0,
        wins: row.wins ?? 0,
        divisionAbbrev: row.divisionAbbrev,
        conferenceAbbrev: row.conferenceAbbrev,
        divisionSequence: row.divisionSequence,
        wildcardSequence: row.wildcardSequence,
      };
    });
  } catch (err) {
    return keepLastGood(`field mapping failed (${err.message})`, existing);
  }

  teams.sort(compareWorstFirst);

  const output = {
    updated: new Date().toISOString(),
    seasonId,
    provisional: false,
    teams,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`update-standings: wrote ${teams.length} teams (worst: ${teams[0].name}, best: ${teams[31].name}).`);
}

main().catch((err) => {
  console.error("update-standings: unexpected error, keeping last good file.", err);
  process.exit(0);
});

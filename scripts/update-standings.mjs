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

function compareBestFirst(a, b) {
  return -compareWorstFirst(a, b);
}

// Fallback "if the playoffs started today" computation - kept in sync with
// src/lib/standings.ts's computePlayoffField. Only used if the live response
// doesn't carry usable divisionSequence/wildcardSequence for every team.
function computePlayoffFieldFallback(teams) {
  const divisionQualifiers = new Set();
  const byDivision = new Map();
  for (const team of teams) {
    const group = byDivision.get(team.divisionAbbrev) ?? [];
    group.push(team);
    byDivision.set(team.divisionAbbrev, group);
  }
  for (const divisionTeams of byDivision.values()) {
    [...divisionTeams].sort(compareBestFirst).slice(0, 3).forEach((t) => divisionQualifiers.add(t.abbrev));
  }

  const wildcardQualifiers = new Set();
  const byConference = new Map();
  for (const team of teams) {
    const group = byConference.get(team.conferenceAbbrev) ?? [];
    group.push(team);
    byConference.set(team.conferenceAbbrev, group);
  }
  for (const conferenceTeams of byConference.values()) {
    const remaining = conferenceTeams.filter((t) => !divisionQualifiers.has(t.abbrev));
    [...remaining].sort(compareBestFirst).slice(0, 2).forEach((t) => wildcardQualifiers.add(t.abbrev));
  }

  return new Map(teams.map((t) => [t.abbrev, divisionQualifiers.has(t.abbrev) || wildcardQualifiers.has(t.abbrev)]));
}

// Prefers the live standings response's own divisionSequence/wildcardSequence
// (verified against a live response: divisionSequence is 1-8 rank within
// division, wildcardSequence is 1-10 rank within conference among teams
// outside their division's top 3, with 0 meaning "not applicable" for those
// automatic qualifiers) - falls back to computing it ourselves only if any
// row is missing them.
function computeInPlayoffs(teams, rawRowsByAbbrev) {
  const allRowsHaveSequences = teams.every((t) => {
    const raw = rawRowsByAbbrev.get(t.abbrev);
    return Number.isFinite(raw?.divisionSequence) && Number.isFinite(raw?.wildcardSequence);
  });

  if (allRowsHaveSequences) {
    return new Map(
      teams.map((t) => {
        const raw = rawRowsByAbbrev.get(t.abbrev);
        const inPlayoffs = raw.divisionSequence <= 3 || (raw.wildcardSequence >= 1 && raw.wildcardSequence <= 2);
        return [t.abbrev, inPlayoffs];
      })
    );
  }

  console.warn("update-standings: live response missing division/wildcard sequence fields - computing playoff field manually.");
  return computePlayoffFieldFallback(teams);
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
  let rawRowsByAbbrev;
  try {
    rawRowsByAbbrev = new Map(rows.map((row) => [row.teamAbbrev?.default, row]));
    teams = rows.map((row) => {
      const abbrev = row.teamAbbrev?.default;
      const name = NAME_BY_ABBREV[abbrev];
      if (!name) throw new Error(`unrecognized team abbrev "${abbrev}"`);
      if (!row.divisionAbbrev || !row.conferenceAbbrev) {
        throw new Error(`missing division/conference for "${abbrev}"`);
      }

      return {
        abbrev,
        name,
        gamesPlayed: row.gamesPlayed ?? 0,
        points: row.points ?? 0,
        pointPctg: row.pointPctg ?? 0,
        regulationWins: row.regulationWins ?? 0,
        row: row.regulationPlusOtWins ?? 0,
        wins: row.wins ?? 0,
        losses: row.losses ?? 0,
        otLosses: row.otLosses ?? 0,
        streakCode: row.streakCode ?? "",
        streakCount: row.streakCount ?? 0,
        l10Wins: row.l10Wins ?? 0,
        l10Losses: row.l10Losses ?? 0,
        l10OtLosses: row.l10OtLosses ?? 0,
        divisionAbbrev: row.divisionAbbrev,
        conferenceAbbrev: row.conferenceAbbrev,
      };
    });
  } catch (err) {
    return keepLastGood(`field mapping failed (${err.message})`, existing);
  }

  const inPlayoffsByAbbrev = computeInPlayoffs(teams, rawRowsByAbbrev);
  teams = teams.map((t) => ({ ...t, inPlayoffs: inPlayoffsByAbbrev.get(t.abbrev) ?? false }));

  const playoffCount = teams.filter((t) => t.inPlayoffs).length;
  if (playoffCount !== 16) {
    return keepLastGood(`computed ${playoffCount} playoff teams, expected 16 - refusing to trust this result`, existing);
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

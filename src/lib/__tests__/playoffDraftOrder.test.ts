import { describe, expect, it } from "vitest";
import { resolvePlayoffPickOrder, type PlayoffResults } from "../playoffDraftOrder";
import type { TeamStanding } from "../standings";

function team(abbrev: string, points: number): TeamStanding {
  return {
    abbrev,
    name: abbrev,
    gamesPlayed: 82,
    points,
    pointPctg: points / 164,
    regulationWins: 0,
    row: 0,
    wins: 0,
    losses: 0,
    otLosses: 0,
    goalDifferential: 0,
    goalsFor: 0,
    streakCode: "W",
    streakCount: 0,
    l10Wins: 0,
    l10Losses: 0,
    l10OtLosses: 0,
    divisionAbbrev: "D",
    conferenceAbbrev: "C",
    inPlayoffs: true,
  };
}

// 16 playoff teams, worst-first by points (this is what getLotteryPool's
// otherTeams already looks like).
function playoffTeams(): TeamStanding[] {
  return Array.from({ length: 16 }, (_, i) => team(`T${i + 1}`, 80 + i)).sort((a, b) => a.points - b.points);
}

describe("resolvePlayoffPickOrder", () => {
  it("falls back to plain regular-season order when playoff results aren't known yet", () => {
    const teams = playoffTeams();
    expect(resolvePlayoffPickOrder(teams, null)).toEqual(teams);
  });

  it("puts every non-finalist playoff team first (picks 17-28), still worst-first by record - no sub-split by elimination round", () => {
    const teams = playoffTeams();
    const results: PlayoffResults = {
      conferenceFinalLosers: ["T15", "T16"],
      cupFinalLoser: "T13",
      cupFinalWinner: "T14",
    };

    const ordered = resolvePlayoffPickOrder(teams, results);
    const everyoneElseAbbrevs = ordered.slice(0, 12).map((t) => t.abbrev);

    // T1..T12 are worst-first among the non-finalists, unaffected by which
    // round T13-T16 were eliminated in.
    expect(everyoneElseAbbrevs).toEqual(["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"]);
  });

  it("puts the two conference-final losers next (picks 29-30), worst-first between them", () => {
    const teams = playoffTeams();
    const results: PlayoffResults = {
      conferenceFinalLosers: ["T16", "T15"], // deliberately out of order in the input
      cupFinalLoser: "T13",
      cupFinalWinner: "T14",
    };

    const ordered = resolvePlayoffPickOrder(teams, results);
    expect([ordered[12].abbrev, ordered[13].abbrev]).toEqual(["T15", "T16"]);
  });

  it("puts the Cup Final loser 31st and the champion last (32nd), regardless of their regular-season records", () => {
    const teams = playoffTeams();
    // T1 (worst regular-season record of anyone) wins the Cup; T2 loses the Final.
    const results: PlayoffResults = {
      conferenceFinalLosers: ["T15", "T16"],
      cupFinalLoser: "T2",
      cupFinalWinner: "T1",
    };

    const ordered = resolvePlayoffPickOrder(teams, results);
    expect(ordered[14].abbrev).toBe("T2");
    expect(ordered[15].abbrev).toBe("T1");
    // T1/T2 must not also appear among the first 12 "everyone else" slots.
    expect(ordered.slice(0, 12).map((t) => t.abbrev)).not.toContain("T1");
    expect(ordered.slice(0, 12).map((t) => t.abbrev)).not.toContain("T2");
  });

  it("returns exactly 16 teams with no duplicates for a fully valid result", () => {
    const teams = playoffTeams();
    const results: PlayoffResults = {
      conferenceFinalLosers: ["T15", "T16"],
      cupFinalLoser: "T13",
      cupFinalWinner: "T14",
    };

    const ordered = resolvePlayoffPickOrder(teams, results);
    expect(ordered).toHaveLength(16);
    expect(new Set(ordered.map((t) => t.abbrev)).size).toBe(16);
  });

  it("falls back to regular-season order if a listed abbreviation doesn't match any playoff team", () => {
    const teams = playoffTeams();
    const results: PlayoffResults = {
      conferenceFinalLosers: ["T15", "NOT_A_REAL_TEAM"],
      cupFinalLoser: "T13",
      cupFinalWinner: "T14",
    };

    expect(resolvePlayoffPickOrder(teams, results)).toEqual(teams);
  });
});

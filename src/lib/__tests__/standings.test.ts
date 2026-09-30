import { describe, expect, it } from "vitest";
import { computePlayoffField, getLotteryPool, sortTeamsWorstFirst, type TeamStanding } from "../standings";

// Points default to a derivation from pointPctg (at a fixed 10 GP) so existing
// fixtures written in terms of pointPctg still produce the matching points
// total the real comparator now sorts on - pass `points` explicitly to test
// the points/games-played mechanics directly (see the "games played" tests).
function team(overrides: Partial<TeamStanding> & { abbrev: string }): TeamStanding {
  const gamesPlayed = overrides.gamesPlayed ?? 10;
  const pointPctg = overrides.pointPctg ?? 0;
  const derivedPoints = Math.round(pointPctg * gamesPlayed * 2);

  return {
    name: overrides.abbrev,
    gamesPlayed,
    points: derivedPoints,
    pointPctg,
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
    divisionAbbrev: "DIV",
    conferenceAbbrev: "CONF",
    inPlayoffs: false,
    ...overrides,
  };
}

describe("sortTeamsWorstFirst", () => {
  it("sorts by points percentage first, worst (lowest) first", () => {
    const teams = [
      team({ abbrev: "A", pointPctg: 0.6 }),
      team({ abbrev: "B", pointPctg: 0.3 }),
      team({ abbrev: "C", pointPctg: 0.45 }),
    ];

    expect(sortTeamsWorstFirst(teams).map((t) => t.abbrev)).toEqual(["B", "C", "A"]);
  });

  it("breaks a points% tie on fewer regulation wins", () => {
    const teams = [
      team({ abbrev: "A", pointPctg: 0.5, regulationWins: 10 }),
      team({ abbrev: "B", pointPctg: 0.5, regulationWins: 4 }),
    ];

    expect(sortTeamsWorstFirst(teams).map((t) => t.abbrev)).toEqual(["B", "A"]);
  });

  it("breaks a points%+RW tie on fewer ROW", () => {
    const teams = [
      team({ abbrev: "A", pointPctg: 0.5, regulationWins: 5, row: 8 }),
      team({ abbrev: "B", pointPctg: 0.5, regulationWins: 5, row: 3 }),
    ];

    expect(sortTeamsWorstFirst(teams).map((t) => t.abbrev)).toEqual(["B", "A"]);
  });

  it("breaks a points%+RW+ROW tie on fewer wins", () => {
    const teams = [
      team({ abbrev: "A", pointPctg: 0.5, regulationWins: 5, row: 5, wins: 12 }),
      team({ abbrev: "B", pointPctg: 0.5, regulationWins: 5, row: 5, wins: 6 }),
    ];

    expect(sortTeamsWorstFirst(teams).map((t) => t.abbrev)).toEqual(["B", "A"]);
  });

  it("does not mutate the input array", () => {
    const teams = [team({ abbrev: "A", pointPctg: 0.6 }), team({ abbrev: "B", pointPctg: 0.3 })];
    const original = [...teams];

    sortTeamsWorstFirst(teams);

    expect(teams).toEqual(original);
  });

  it("ranks a team that has played and lost below a team that hasn't played yet (both tied at 0 points)", () => {
    const playedAndLost = team({ abbrev: "LOSER", gamesPlayed: 1, points: 0 });
    const hasntPlayed = team({ abbrev: "UNPLAYED", gamesPlayed: 0, points: 0 });

    // Real NHL rule: tied on points -> fewer games played is better, so the
    // 0-GP team ranks ahead of (better than) the team that's actually 0-1-0.
    expect(sortTeamsWorstFirst([hasntPlayed, playedAndLost]).map((t) => t.abbrev)).toEqual(["LOSER", "UNPLAYED"]);
  });

  it("breaks an exact points tie by fewer games played before looking at RW/ROW/wins", () => {
    const fewerGames = team({ abbrev: "FEWER", gamesPlayed: 5, points: 6, regulationWins: 0 });
    const moreGames = team({ abbrev: "MORE", gamesPlayed: 8, points: 6, regulationWins: 3 });

    // Even though MORE has more regulation wins, it took more games to get the
    // same points total, so by the official tiebreaker it ranks worse.
    expect(sortTeamsWorstFirst([fewerGames, moreGames]).map((t) => t.abbrev)).toEqual(["MORE", "FEWER"]);
  });

  it("ranks by raw points first, not points percentage, when points actually differ", () => {
    // A has fewer points in more games (worse rate); B has more points in
    // fewer games (better rate). The real standings/tiebreak rule sorts on
    // points directly - percentage only matters as an explanatory tiebreak
    // when points are tied - so A (8 pts) is worse than B (10 pts) here even
    // though B's points percentage is higher.
    const a = team({ abbrev: "A", gamesPlayed: 20, points: 8 });
    const b = team({ abbrev: "B", gamesPlayed: 10, points: 10 });

    expect(sortTeamsWorstFirst([b, a]).map((t) => t.abbrev)).toEqual(["A", "B"]);
  });

  it("falls back to goal differential, then goals for, after points/GP/RW/ROW/wins all tie", () => {
    const worseDiff = team({ abbrev: "WORSE_DIFF", points: 10, gamesPlayed: 10, goalDifferential: -5, goalsFor: 20 });
    const betterDiff = team({ abbrev: "BETTER_DIFF", points: 10, gamesPlayed: 10, goalDifferential: 2, goalsFor: 15 });

    expect(sortTeamsWorstFirst([betterDiff, worseDiff]).map((t) => t.abbrev)).toEqual(["WORSE_DIFF", "BETTER_DIFF"]);

    const worseGf = team({ abbrev: "WORSE_GF", points: 10, gamesPlayed: 10, goalDifferential: 0, goalsFor: 10 });
    const betterGf = team({ abbrev: "BETTER_GF", points: 10, gamesPlayed: 10, goalDifferential: 0, goalsFor: 25 });

    expect(sortTeamsWorstFirst([betterGf, worseGf]).map((t) => t.abbrev)).toEqual(["WORSE_GF", "BETTER_GF"]);
  });
});

// A small two-conference league (E: divisions A/M, W: divisions P/C, 5 teams
// each) - big enough that each conference has 4 real wildcard candidates
// competing for 2 spots, instead of an all-remaining-teams-qualify degenerate case.
function league(): TeamStanding[] {
  return [
    // Conference E - strong: even 4th/5th place teams have decent points, but only 2 of the 4 candidates get wildcards.
    team({ abbrev: "A1", conferenceAbbrev: "E", divisionAbbrev: "A", pointPctg: 0.9 }),
    team({ abbrev: "A2", conferenceAbbrev: "E", divisionAbbrev: "A", pointPctg: 0.8 }),
    team({ abbrev: "A3", conferenceAbbrev: "E", divisionAbbrev: "A", pointPctg: 0.7 }),
    team({ abbrev: "A4", conferenceAbbrev: "E", divisionAbbrev: "A", pointPctg: 0.6 }),
    team({ abbrev: "A5", conferenceAbbrev: "E", divisionAbbrev: "A", pointPctg: 0.5 }),
    team({ abbrev: "M1", conferenceAbbrev: "E", divisionAbbrev: "M", pointPctg: 0.85 }),
    team({ abbrev: "M2", conferenceAbbrev: "E", divisionAbbrev: "M", pointPctg: 0.75 }),
    team({ abbrev: "M3", conferenceAbbrev: "E", divisionAbbrev: "M", pointPctg: 0.65 }),
    team({ abbrev: "M4", conferenceAbbrev: "E", divisionAbbrev: "M", pointPctg: 0.55 }),
    team({ abbrev: "M5", conferenceAbbrev: "E", divisionAbbrev: "M", pointPctg: 0.45 }),
    // Conference W - weak: division-leading teams have far fewer points than conference E's also-rans.
    team({ abbrev: "P1", conferenceAbbrev: "W", divisionAbbrev: "P", pointPctg: 0.3 }),
    team({ abbrev: "P2", conferenceAbbrev: "W", divisionAbbrev: "P", pointPctg: 0.25 }),
    team({ abbrev: "P3", conferenceAbbrev: "W", divisionAbbrev: "P", pointPctg: 0.2 }),
    team({ abbrev: "P4", conferenceAbbrev: "W", divisionAbbrev: "P", pointPctg: 0.15 }),
    team({ abbrev: "P5", conferenceAbbrev: "W", divisionAbbrev: "P", pointPctg: 0.1 }),
    team({ abbrev: "C1", conferenceAbbrev: "W", divisionAbbrev: "C", pointPctg: 0.28 }),
    team({ abbrev: "C2", conferenceAbbrev: "W", divisionAbbrev: "C", pointPctg: 0.22 }),
    team({ abbrev: "C3", conferenceAbbrev: "W", divisionAbbrev: "C", pointPctg: 0.18 }),
    team({ abbrev: "C4", conferenceAbbrev: "W", divisionAbbrev: "C", pointPctg: 0.13 }),
    team({ abbrev: "C5", conferenceAbbrev: "W", divisionAbbrev: "C", pointPctg: 0.08 }),
  ];
}

function inPlayoffsMap(teams: TeamStanding[]): Record<string, boolean> {
  return Object.fromEntries(teams.map((t) => [t.abbrev, t.inPlayoffs]));
}

describe("computePlayoffField", () => {
  it("qualifies the top 3 of every division automatically", () => {
    const field = inPlayoffsMap(computePlayoffField(league()));

    expect(field.A1).toBe(true);
    expect(field.A2).toBe(true);
    expect(field.A3).toBe(true);
    expect(field.P1).toBe(true);
    expect(field.P2).toBe(true);
    expect(field.P3).toBe(true);
  });

  it("picks the 2 best remaining teams in each conference as wild cards, not just whoever's left", () => {
    const field = inPlayoffsMap(computePlayoffField(league()));

    // Conference E wildcard candidates are A4/A5/M4/M5 (0.6/0.5/0.55/0.45) - top 2 are A4 and M4.
    expect(field.A4).toBe(true);
    expect(field.M4).toBe(true);
    expect(field.A5).toBe(false);
    expect(field.M5).toBe(false);
  });

  it("excludes a playoff-field team's higher-points, other-conference counterpart from the field (conference-relative, not points-absolute)", () => {
    const field = inPlayoffsMap(computePlayoffField(league()));

    // P3 (0.2 pts) takes conference W's 3rd division spot despite far fewer
    // points than A5 (0.5 pts), which misses the playoffs entirely in the
    // stronger conference E.
    expect(field.P3).toBe(true);
    expect(field.A5).toBe(false);
  });

  it("breaks a tied-points division boundary using the standings tiebreaker (RW)", () => {
    const teams = [
      team({ abbrev: "X1", conferenceAbbrev: "C1", divisionAbbrev: "D1", pointPctg: 0.9 }),
      team({ abbrev: "X2", conferenceAbbrev: "C1", divisionAbbrev: "D1", pointPctg: 0.8 }),
      // X3 and X4 are tied on points% for the division's 3rd automatic spot; X3 has more RW and should win it.
      team({ abbrev: "X3", conferenceAbbrev: "C1", divisionAbbrev: "D1", pointPctg: 0.5, regulationWins: 10 }),
      team({ abbrev: "X4", conferenceAbbrev: "C1", divisionAbbrev: "D1", pointPctg: 0.5, regulationWins: 4 }),
      // A second division with its own 3 automatic qualifiers plus 2 wildcard
      // candidates that both outrank X4, so X4 can't sneak in as a wildcard
      // either - isolating the division-boundary tiebreaker being tested.
      team({ abbrev: "Y1", conferenceAbbrev: "C1", divisionAbbrev: "D2", pointPctg: 0.95 }),
      team({ abbrev: "Y2", conferenceAbbrev: "C1", divisionAbbrev: "D2", pointPctg: 0.85 }),
      team({ abbrev: "Y3", conferenceAbbrev: "C1", divisionAbbrev: "D2", pointPctg: 0.75 }),
      team({ abbrev: "Y4", conferenceAbbrev: "C1", divisionAbbrev: "D2", pointPctg: 0.65 }),
      team({ abbrev: "Y5", conferenceAbbrev: "C1", divisionAbbrev: "D2", pointPctg: 0.6 }),
    ];

    const field = inPlayoffsMap(computePlayoffField(teams));

    expect(field.X3).toBe(true);
    expect(field.X4).toBe(false);
  });
});

describe("getLotteryPool", () => {
  it("puts the higher-points, non-playoff team in the lottery pool and keeps the lower-points playoff team out of it", () => {
    const field = computePlayoffField(league());
    const { lotteryTeams, otherTeams } = getLotteryPool(field);

    const lotteryAbbrevs = lotteryTeams.map((t) => t.abbrev);
    const otherAbbrevs = otherTeams.map((t) => t.abbrev);

    expect(lotteryAbbrevs).toContain("A5");
    expect(lotteryAbbrevs).not.toContain("P3");
    expect(otherAbbrevs).toContain("P3");
    expect(otherAbbrevs).not.toContain("A5");
  });

  it("splits into exactly the inPlayoffs=false / true groups, each sorted worst-first", () => {
    const field = computePlayoffField(league());
    const { lotteryTeams, otherTeams } = getLotteryPool(field);

    // 20 teams: 4 divisions x 3 automatic + 2 conferences x 2 wildcards = 16 in the playoff field, 4 left for the lottery.
    expect(lotteryTeams).toHaveLength(4);
    expect(otherTeams).toHaveLength(16);
    expect(lotteryTeams.every((t) => !t.inPlayoffs)).toBe(true);
    expect(otherTeams.every((t) => t.inPlayoffs)).toBe(true);
    for (let i = 1; i < lotteryTeams.length; i++) {
      expect(lotteryTeams[i].pointPctg).toBeGreaterThanOrEqual(lotteryTeams[i - 1].pointPctg);
    }
  });
});

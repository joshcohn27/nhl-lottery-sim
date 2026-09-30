import { describe, expect, it } from "vitest";
import { sortTeamsWorstFirst, type TeamStanding } from "../standings";

function team(overrides: Partial<TeamStanding> & { abbrev: string }): TeamStanding {
  return {
    name: overrides.abbrev,
    gamesPlayed: 10,
    points: 0,
    pointPctg: 0,
    regulationWins: 0,
    row: 0,
    wins: 0,
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
});

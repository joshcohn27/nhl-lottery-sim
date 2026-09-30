import { describe, expect, it } from "vitest";
import { isEligibleToAdvance, teamsWithAdvanceHistory, winsInWindow, type LotteryHistory } from "../lotteryEligibility";

const rule = { maxWins: 2, windowYears: 5, firstYear: 2022 };

function historyWith(moves: LotteryHistory["moves"]): LotteryHistory {
  return { rule, moves };
}

describe("winsInWindow", () => {
  it("a 2022 win is inside the window for the 2026 lottery (2022-2025)", () => {
    const history = historyWith([{ year: 2022, team: "NJD", spots: 3 }]);
    expect(winsInWindow("NJD", 2026, history)).toBe(1);
  });

  it("a 2022 win drops out of the window for the 2027 lottery (2023-2026)", () => {
    const history = historyWith([{ year: 2022, team: "NJD", spots: 3 }]);
    expect(winsInWindow("NJD", 2027, history)).toBe(0);
  });

  it("never counts wins from before the rule's firstYear", () => {
    const history = historyWith([{ year: 2021, team: "SEA", spots: 5 }]);
    expect(winsInWindow("SEA", 2025, history)).toBe(0);
  });

  it("does not count a move where spots is 0 (no improvement)", () => {
    const history = historyWith([{ year: 2024, team: "SJS", spots: 0 }]);
    expect(winsInWindow("SJS", 2027, history)).toBe(0);
  });

  it("ignores moves for other teams", () => {
    const history = historyWith([{ year: 2025, team: "NYI", spots: 9 }]);
    expect(winsInWindow("UTA", 2027, history)).toBe(0);
  });
});

describe("isEligibleToAdvance", () => {
  it("is eligible with 0 or 1 qualifying wins in the window", () => {
    const history = historyWith([{ year: 2025, team: "CHI", spots: 2 }]);
    expect(isEligibleToAdvance("CHI", 2027, history)).toBe(true);
  });

  it("blocks a fixture team with 2 qualifying wins inside the window", () => {
    const history = historyWith([
      { year: 2024, team: "FAKE", spots: 4 },
      { year: 2026, team: "FAKE", spots: 2 },
    ]);
    expect(isEligibleToAdvance("FAKE", 2027, history)).toBe(false);
  });

  it("re-admits that same fixture team once the earlier win rolls out of the window", () => {
    const history = historyWith([
      { year: 2024, team: "FAKE", spots: 4 },
      { year: 2026, team: "FAKE", spots: 2 },
    ]);
    // 2031 lottery window is 2027-2030: neither 2024 nor 2026 win is inside it.
    expect(isEligibleToAdvance("FAKE", 2031, history)).toBe(true);
  });
});

describe("teamsWithAdvanceHistory", () => {
  it("lists only teams with qualifying wins in the window, sorted most-wins-first", () => {
    const history = historyWith([
      { year: 2022, team: "NJD", spots: 3 },
      { year: 2023, team: "CHI", spots: 2 },
      { year: 2025, team: "NYI", spots: 9 },
      { year: 2025, team: "UTA", spots: 10 },
      { year: 2026, team: "TOR", spots: 4 },
      { year: 2026, team: "SJS", spots: 7 },
    ]);

    const result = teamsWithAdvanceHistory(2027, history);

    expect(result.map((r) => r.team)).not.toContain("NJD");
    expect(result).toEqual(
      expect.arrayContaining([
        { team: "CHI", wins: 1 },
        { team: "NYI", wins: 1 },
        { team: "UTA", wins: 1 },
        { team: "TOR", wins: 1 },
        { team: "SJS", wins: 1 },
      ])
    );
  });
});

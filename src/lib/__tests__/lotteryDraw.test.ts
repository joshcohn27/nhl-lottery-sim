import { describe, expect, it } from "vitest";
import {
  applyLotteryDrawAssignment,
  buildLotterySlots,
  didLotteryMoveImprovePick,
  getAwardedPick,
  getHighestAllowedPick,
  parseComboCsv,
  resolveCombo,
  type LotteryAssignment,
} from "../lotteryDraw";

describe("didLotteryMoveImprovePick", () => {
  it("counts as a move when the awarded pick is better (lower) than the original slot", () => {
    expect(didLotteryMoveImprovePick(5, 2)).toBe(true);
  });

  it("does not count when the worst team wins and simply keeps pick 1", () => {
    expect(didLotteryMoveImprovePick(1, 1)).toBe(false);
  });

  it("does not count a draw win that doesn't change the team's slot", () => {
    expect(didLotteryMoveImprovePick(3, 3)).toBe(false);
  });

  it("does not count a move to a worse (higher-numbered) slot", () => {
    expect(didLotteryMoveImprovePick(3, 5)).toBe(false);
  });
});

describe("parseComboCsv / resolveCombo", () => {
  const csv = ["id,ball1,ball2,ball3,ball4,slot,slotSequence", "1,1,2,3,4,1,1", "2,1,2,3,5,2,1"].join("\n");

  it("parses rows into slot-keyed combos", () => {
    const rows = parseComboCsv(csv);
    expect(rows).toEqual([
      { id: 1, balls: [1, 2, 3, 4], slot: 1, slotSequence: 1 },
      { id: 2, balls: [1, 2, 3, 5], slot: 2, slotSequence: 1 },
    ]);
  });

  it("resolves a known combo to its slot regardless of ball order", () => {
    const rows = parseComboCsv(csv);
    expect(resolveCombo(rows, [4, 3, 2, 1])).toEqual({ id: 1, balls: [1, 2, 3, 4], slot: 1, slotSequence: 1 });
  });

  it("resolves the reserved combo to a redraw", () => {
    const rows = parseComboCsv(csv);
    expect(resolveCombo(rows, [11, 12, 13, 14])).toBe("redraw");
  });

  it("returns null for a combo that isn't in the table and isn't the redraw combo", () => {
    const rows = parseComboCsv(csv);
    expect(resolveCombo(rows, [9, 10, 11, 12])).toBeNull();
  });
});

describe("getHighestAllowedPick / getAwardedPick (10-spot move-up cap)", () => {
  it("caps the move-up at maxMoveUp spots", () => {
    expect(getHighestAllowedPick(16, 10, 16)).toBe(6);
  });

  it("never allows a slot below 1", () => {
    expect(getHighestAllowedPick(5, 10, 16)).toBe(1);
  });

  it("awards the target pick directly when the team's cap doesn't restrict it", () => {
    // highestAllowedPick (1) is better than the target (3), so the target itself is awarded.
    const awarded = getAwardedPick(3, 1, new Set(), 16);
    expect(awarded).toBe(3);
  });

  it("awards the highest allowed pick, not the raw target, once the cap makes the target unreachable", () => {
    // Team ranked 16th (highestAllowedPick = 6) wins the draw for pick 1 - can't jump that far.
    const awarded = getAwardedPick(1, 6, new Set(), 16);
    expect(awarded).toBe(6);
  });

  it("moves to the next open pick beyond the cap when the capped slot is already taken", () => {
    const awarded = getAwardedPick(1, 6, new Set([6, 7]), 16);
    expect(awarded).toBe(8);
  });
});

describe("buildLotterySlots + applyLotteryDrawAssignment", () => {
  const lotteryTeamNames = ["A", "B", "C", "D"];

  it("fills undrawn slots with remaining teams in their original order", () => {
    const assignments: LotteryAssignment[] = [{ team: "C", pick: 1, source: "draw" }];
    const slots = buildLotterySlots(assignments, lotteryTeamNames);
    expect(slots).toEqual({ 1: "C", 2: "A", 3: "B", 4: "D" });
  });

  it("bumps the team that would have held the target pick into the next default slot", () => {
    // D wins the draw for pick 1, but D's own move-up cap only allows it up to pick 2 -
    // so pick 1 locks in to whoever the standings order would have put there by default.
    const { assignments, awardedPick, defaultLockedTeam } = applyLotteryDrawAssignment(
      [],
      "D",
      1,
      2,
      lotteryTeamNames
    );

    expect(awardedPick).toBe(2);
    expect(defaultLockedTeam).toBe("A");
    expect(assignments).toEqual([
      { team: "D", pick: 2, source: "draw" },
      { team: "A", pick: 1, source: "default" },
    ]);
  });

  it("does not lock a default team when the winner takes the target pick outright", () => {
    const { assignments, defaultLockedTeam } = applyLotteryDrawAssignment([], "C", 1, 1, lotteryTeamNames);

    expect(defaultLockedTeam).toBeNull();
    expect(assignments).toEqual([{ team: "C", pick: 1, source: "draw" }]);
  });
});

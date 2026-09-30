import { describe, expect, it } from "vitest";
import { computeEffectivePick1OddsBySlot, LOTTERY_ODDS_BY_SLOT, MAX_MOVE_UP } from "../config";

describe("computeEffectivePick1OddsBySlot", () => {
  it("matches the real, publicly reported 2026 lottery effective #1-overall odds table", () => {
    const effective = computeEffectivePick1OddsBySlot(LOTTERY_ODDS_BY_SLOT, MAX_MOVE_UP);

    expect(effective).toEqual([25.5, 13.5, 11.5, 9.5, 8.5, 7.5, 6.5, 6.0, 5.0, 3.5, 3.0, 0, 0, 0, 0, 0]);
  });

  it("gives every team ranked beyond the move-up cap a 0% chance at pick 1", () => {
    const effective = computeEffectivePick1OddsBySlot(LOTTERY_ODDS_BY_SLOT, MAX_MOVE_UP);
    const unreachableRanks = effective.slice(MAX_MOVE_UP + 1);

    expect(unreachableRanks.every((odds) => odds === 0)).toBe(true);
  });

  it("sums to the same total as the raw odds table (probability mass is conserved, just redistributed)", () => {
    const raw = LOTTERY_ODDS_BY_SLOT.reduce((sum, odds) => sum + odds, 0);
    const effective = computeEffectivePick1OddsBySlot(LOTTERY_ODDS_BY_SLOT, MAX_MOVE_UP).reduce(
      (sum, odds) => sum + odds,
      0
    );

    expect(effective).toBeCloseTo(raw, 5);
  });
});

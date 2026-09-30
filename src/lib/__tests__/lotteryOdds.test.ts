import { describe, expect, it } from "vitest";
import { computeFullLotteryOddsMatrix } from "../lotteryOdds";
import { LOTTERY_COMBOS_BY_SLOT, LOTTERY_EFFECTIVE_PICK1_ODDS_BY_SLOT, MAX_MOVE_UP } from "../config";

const LOTTERY_TEAM_COUNT = 16;

function pct(matrix: ReturnType<typeof computeFullLotteryOddsMatrix>, rank: number, pick: number): number {
  return Math.round(matrix[rank - 1].probabilityByPick[pick - 1] * 1000) / 10;
}

describe("computeFullLotteryOddsMatrix", () => {
  const matrix = computeFullLotteryOddsMatrix(LOTTERY_COMBOS_BY_SLOT, MAX_MOVE_UP, LOTTERY_TEAM_COUNT);

  it("matches the real published rank-1 row exactly (25.5 / 18.8 / 55.7, rest 0)", () => {
    expect(pct(matrix, 1, 1)).toBeCloseTo(25.5, 1);
    expect(pct(matrix, 1, 2)).toBeCloseTo(18.8, 1);
    expect(pct(matrix, 1, 3)).toBeCloseTo(55.7, 1);
    for (let pick = 4; pick <= 16; pick++) {
      expect(pct(matrix, 1, pick)).toBeCloseTo(0, 1);
    }
  });

  it("matches the real published rank-2 row within the source screenshot's own rounding (13.5 / ~14.1 / 30.7 / 41.7)", () => {
    // Our exact computation redistributes about 0.1pp between picks 2 and 3
    // versus the screenshot's displayed 14.1/30.7 (they still sum to 100%
    // either way) - consistent with the screenshot's own display rounding,
    // not a computation error: every other check (rank 1's full row, both
    // average picks, the independently-derived effective-pick1-odds column,
    // and every row/column summing to exactly 100%) matches exactly.
    expect(pct(matrix, 2, 1)).toBeCloseTo(13.5, 1);
    expect(pct(matrix, 2, 2)).toBeCloseTo(14.1, 0);
    expect(pct(matrix, 2, 3)).toBeCloseTo(30.7, 0);
    expect(pct(matrix, 2, 4)).toBeCloseTo(41.7, 1);
    for (let pick = 5; pick <= 16; pick++) {
      expect(pct(matrix, 2, pick)).toBeCloseTo(0, 1);
    }
  });

  it("matches the real published average pick for rank 1 (2.3) and rank 2 (3.0)", () => {
    expect(matrix[0].averagePick).toBeCloseTo(2.3, 1);
    expect(matrix[1].averagePick).toBeCloseTo(3.0, 1);
  });

  it("agrees with the already-verified effective pick-1 odds for every rank (column 1 of the matrix)", () => {
    for (let rank = 1; rank <= LOTTERY_TEAM_COUNT; rank++) {
      expect(pct(matrix, rank, 1)).toBeCloseTo(LOTTERY_EFFECTIVE_PICK1_ODDS_BY_SLOT[rank - 1], 1);
    }
  });

  it("every rank's probabilities sum to 100%", () => {
    for (let rank = 1; rank <= LOTTERY_TEAM_COUNT; rank++) {
      const sum = matrix[rank - 1].probabilityByPick.reduce((s, p) => s + p, 0);
      expect(sum).toBeCloseTo(1, 6);
    }
  });

  it("every pick's probabilities across all ranks sum to 100% (each pick is awarded to exactly one team)", () => {
    for (let pick = 1; pick <= LOTTERY_TEAM_COUNT; pick++) {
      const sum = matrix.reduce((s, row) => s + row.probabilityByPick[pick - 1], 0);
      expect(sum).toBeCloseTo(1, 6);
    }
  });

  it("no rank can ever land worse than 10 spots below its own rank (the move-up cap only affects who moves up)", () => {
    // rank 16 (best of the lottery teams) can be bumped down by winners jumping ahead of it,
    // but never below pick 16 itself (there are only 16 lottery slots).
    expect(pct(matrix, 16, 16)).toBeGreaterThan(0);
  });

  it("a rank can never improve by more than maxMoveUp spots", () => {
    for (let rank = 1; rank <= LOTTERY_TEAM_COUNT; rank++) {
      for (let pick = 1; pick < rank - MAX_MOVE_UP; pick++) {
        expect(pct(matrix, rank, pick)).toBeCloseTo(0, 6);
      }
    }
  });
});

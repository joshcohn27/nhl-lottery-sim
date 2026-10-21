import { describe, expect, it } from "vitest";
import { chooseAutoPick, positionGroup } from "../autoPick";
import type { Prospect } from "../prospects";

const p = (rank: number, pos: string): Prospect => ({ rank, name: `P${rank}`, pos, league: "" });

// Deterministic PRNG so the frequency checks are stable.
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function frequencies(available: Prospect[], pickNumber: number, runs = 20000, teamPositions: string[] = []) {
  const random = seeded(42);
  const counts = new Map<number, number>();
  for (let i = 0; i < runs; i++) {
    const pick = chooseAutoPick(available, teamPositions, pickNumber, random)!;
    counts.set(pick.rank, (counts.get(pick.rank) ?? 0) + 1);
  }
  return counts;
}

describe("positionGroup", () => {
  it("groups by the first listed position", () => {
    expect(positionGroup("C/LW")).toBe("C");
    expect(positionGroup("RW/C")).toBe("W");
    expect(positionGroup("LD")).toBe("D");
    expect(positionGroup("RD")).toBe("D");
    expect(positionGroup("G")).toBe("G");
    expect(positionGroup("F")).toBe("F");
  });
});

describe("chooseAutoPick", () => {
  const board = [p(1, "RD"), p(2, "C"), p(3, "LW"), p(4, "C"), p(5, "C"), p(6, "C"), p(7, "F"), p(8, "RW"), p(9, "C")];

  it("takes the best prospect first overall about 99.9% of the time", () => {
    const counts = frequencies(board, 1);
    expect((counts.get(1) ?? 0) / 20000).toBeGreaterThan(0.997);
  });

  it("varies later in the draft instead of always taking the same player", () => {
    const counts = frequencies(board, 28);
    expect(counts.size).toBeGreaterThan(2);
    expect((counts.get(1) ?? 0) / 20000).toBeLessThan(0.8);
  });

  it("in round 1, never reaches more than 5 spots past the best available", () => {
    const counts = frequencies(board, 32);
    expect([...counts.keys()].every((rank) => rank <= 6)).toBe(true);
  });

  it("in round 1, never takes the 4th-best available at a position", () => {
    // Ranks 2, 4, 5 are the top three centers; rank 6 is the fourth.
    const counts = frequencies(board, 32);
    expect(counts.has(6)).toBe(false);
    expect(counts.has(9)).toBe(false);
  });

  it("in round 2, allows a reach of up to 8 spots and the 4th-best at a position, but rarely", () => {
    const deep = [p(1, "C"), p(2, "LD"), p(3, "C"), p(4, "RW"), p(5, "C"), p(6, "RD"), p(7, "C"), p(8, "LW"), p(9, "G"), p(10, "F")];
    const counts = frequencies(deep, 50);
    expect(counts.has(10)).toBe(false); // 9 spots past the best available
    expect(counts.has(7)).toBe(true); // 4th-best center, 6 spots back: allowed now
    const deepReaches = [6, 7, 8, 9].reduce((sum, rank) => sum + (counts.get(rank) ?? 0), 0);
    expect(deepReaches / 20000).toBeLessThan(0.08);
  });

  it("leans away from a position the team already drafted, without ruling it out", () => {
    const evenBoard = [p(1, "C"), p(2, "LD")];
    const withNeed = frequencies(evenBoard, 40, 20000, ["C"]);
    const without = frequencies(evenBoard, 40, 20000, []);
    expect(withNeed.get(1)!).toBeLessThan(without.get(1)!);
    expect(withNeed.get(1)!).toBeGreaterThan(0);
  });

  it("takes a clearly separated top prospect outright", () => {
    const gap = [p(1, "C"), p(9, "C"), p(10, "D")];
    const counts = frequencies(gap, 64);
    expect(counts.get(1)).toBe(20000);
  });

  it("returns undefined when no prospects are left", () => {
    expect(chooseAutoPick([], [], 1)).toBeUndefined();
  });
});

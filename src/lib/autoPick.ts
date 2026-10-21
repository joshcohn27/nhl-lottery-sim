import type { Prospect } from "./prospects";

/** Last pick of round 1; the reach limits loosen after it. */
const ROUND_1_LAST_PICK = 32;

/**
 * How far an auto-pick may stray from the board. Round 1: no more than 5
 * spots past the best available, and no deeper than the 3rd-best available
 * at a position. Round 2 allows 8 spots and the 4th-best at a position;
 * the weighting below keeps those long reaches rare.
 */
export function reachLimits(pickNumber: number): { overall: number; positionDepth: number } {
  return pickNumber <= ROUND_1_LAST_PICK ? { overall: 5, positionDepth: 3 } : { overall: 8, positionDepth: 4 };
}

/**
 * How spread out auto-picks are, by overall pick number. Near zero at the top
 * of the draft (the best prospect goes 1st about 99.9% of the time) and
 * widening as the draft goes on, so later picks vary run to run.
 */
export function autoPickTemperature(pickNumber: number): number {
  return Math.min(1.6, 0.15 + (pickNumber - 1) * 0.035);
}

/** C, W, D, G or F, from a position like "C/LW", "RW/C", "LD" or "F". */
export function positionGroup(pos: string): string {
  const first = pos.toUpperCase().split(/[^A-Z]+/).find(Boolean) ?? "";
  if (first === "LW" || first === "RW" || first === "W") return "W";
  if (first === "LD" || first === "RD" || first === "D") return "D";
  return first;
}

function sharesPosition(pos: string, teamPositions: string[]): boolean {
  const tokens = pos.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  return tokens.some((token) =>
    teamPositions.some((existing) => existing.toUpperCase().split(/[^A-Z]+/).filter(Boolean).includes(token))
  );
}

/**
 * Picks a prospect for a team the user isn't controlling.
 *
 * `available` must be sorted best-first. The pick is a weighted random choice
 * among the prospects that pass both reach limits; weight falls off with
 * distance from the best available (sharply early in the draft, gently
 * later), and is halved for a position the team already drafted.
 */
export function chooseAutoPick(
  available: Prospect[],
  teamPositions: string[],
  pickNumber: number,
  random: () => number = Math.random
): Prospect | undefined {
  if (available.length === 0) return undefined;

  const top = available[0];
  // A clear gap in the rankings: the top prospect is far better than the rest.
  if (available.length > 1 && top.rank + 5 < available[1].rank) return top;

  const depthByGroup = new Map<string, number>();
  const candidates: { prospect: Prospect; weight: number }[] = [];
  const temperature = autoPickTemperature(pickNumber);
  const limits = reachLimits(pickNumber);

  available.forEach((prospect, idx) => {
    const group = positionGroup(prospect.pos);
    const depth = (depthByGroup.get(group) ?? 0) + 1;
    depthByGroup.set(group, depth);

    if (idx > limits.overall || depth > limits.positionDepth) return;

    const need = sharesPosition(prospect.pos, teamPositions) ? 0.5 : 1;
    candidates.push({ prospect, weight: Math.exp(-idx / temperature) * need });
  });

  if (candidates.length === 0) return top;

  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  let roll = random() * total;
  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll <= 0) return candidate.prospect;
  }
  return candidates[candidates.length - 1].prospect;
}

import {
  applyLotteryDrawAssignment,
  buildLotterySlots,
  getAssignedTeams,
  getHighestAllowedPick,
  getNextOpenLotteryPick,
} from "./lotteryDraw";

export interface LotteryOddsRow {
  /** Pre-lottery rank, 1 = worst team. */
  rank: number;
  /** probabilityByPick[i] = probability of ending up with pick i+1 (index 0 = pick 1). */
  probabilityByPick: number[];
  averagePick: number;
}

/**
 * Computes the EXACT probability, for every pre-lottery rank, of ending up
 * with each final pick 1..lotteryTeamCount - by exhaustively weighting every
 * possible (draw1 winner, draw2 winner) pair and resolving each pair with the
 * exact same draw-assignment mechanics the live interactive lottery uses
 * (applyLotteryDrawAssignment/buildLotterySlots), rather than any new
 * probability model. Draw1's winner is chosen with probability
 * combosBySlot[A] / totalCombos; draw2's winner is chosen from the remaining
 * teams with probability combosBySlot[B] / (totalCombos - combosBySlot[A])
 * (redraws-on-repeat just renormalize to this by the standard renewal
 * argument, so no separate redraw simulation is needed). With
 * lotteryTeamCount ranks this is ranks*(ranks-1) weighted scenarios (240 for
 * 16 teams) - fast and exact, not a simulation/approximation.
 */
export function computeFullLotteryOddsMatrix(
  combosBySlot: number[],
  maxMoveUp: number,
  lotteryTeamCount: number
): LotteryOddsRow[] {
  const totalCombos = combosBySlot.reduce((sum, c) => sum + c, 0);
  const teamNames = Array.from({ length: lotteryTeamCount }, (_, i) => `rank-${i + 1}`);
  const matrix: number[][] = Array.from({ length: lotteryTeamCount }, () => new Array(lotteryTeamCount).fill(0));

  for (let aIdx = 0; aIdx < lotteryTeamCount; aIdx++) {
    const comboA = combosBySlot[aIdx] ?? 0;
    if (comboA === 0) continue;
    const probA = comboA / totalCombos;

    const rankA = aIdx + 1;
    const target1 = getNextOpenLotteryPick([], lotteryTeamCount);
    const highestAllowedA = getHighestAllowedPick(rankA, maxMoveUp, lotteryTeamCount);
    const { assignments: afterDraw1 } = applyLotteryDrawAssignment(
      [],
      teamNames[aIdx],
      target1,
      highestAllowedA,
      teamNames
    );

    // A default-lock during draw 1 (e.g. an unreachable team wins, bumping the
    // worst team back into its slot) assigns a SECOND team before draw 2 even
    // happens. That team is "already assigned" too, so - exactly like the
    // live interactive draw's alreadyAssigned check - it must be excluded
    // from draw 2's pool, not just the literal draw-1 winner.
    const assignedAfterDraw1 = getAssignedTeams(afterDraw1);
    const excludedCombos = teamNames.reduce(
      (sum, name, idx) => sum + (assignedAfterDraw1.has(name) ? (combosBySlot[idx] ?? 0) : 0),
      0
    );
    const remainingAfterA = totalCombos - excludedCombos;

    for (let bIdx = 0; bIdx < lotteryTeamCount; bIdx++) {
      if (assignedAfterDraw1.has(teamNames[bIdx])) continue;
      const comboB = combosBySlot[bIdx] ?? 0;
      if (comboB === 0) continue;
      const probB = comboB / remainingAfterA;
      const weight = probA * probB;
      if (weight === 0) continue;

      const rankB = bIdx + 1;
      const target2 = getNextOpenLotteryPick(afterDraw1, lotteryTeamCount);
      const highestAllowedB = getHighestAllowedPick(rankB, maxMoveUp, lotteryTeamCount);
      const { assignments: afterDraw2 } = applyLotteryDrawAssignment(
        afterDraw1,
        teamNames[bIdx],
        target2,
        highestAllowedB,
        teamNames
      );

      const slots = buildLotterySlots(afterDraw2, teamNames);
      const finalPickByTeam = new Map<string, number>();
      for (const [pickStr, teamName] of Object.entries(slots)) {
        finalPickByTeam.set(teamName, Number(pickStr));
      }

      for (let rankIdx = 0; rankIdx < lotteryTeamCount; rankIdx++) {
        const finalPick = finalPickByTeam.get(teamNames[rankIdx]);
        if (finalPick !== undefined) {
          matrix[rankIdx][finalPick - 1] += weight;
        }
      }
    }
  }

  return matrix.map((probabilityByPick, idx) => ({
    rank: idx + 1,
    probabilityByPick,
    averagePick: probabilityByPick.reduce((sum, prob, pickIdx) => sum + prob * (pickIdx + 1), 0),
  }));
}

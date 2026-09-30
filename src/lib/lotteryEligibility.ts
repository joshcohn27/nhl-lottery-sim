export interface LotteryMove {
  year: number;
  team: string;
  spots: number;
}

export interface LotteryHistory {
  rule: {
    maxWins: number;
    windowYears: number;
    firstYear: number;
  };
  moves: LotteryMove[];
}

/**
 * Counts a team's qualifying lottery-win "advances" in the window that applies
 * to `lotteryYear`: [lotteryYear - (windowYears - 1), lotteryYear - 1], clipped
 * to the rule's firstYear so wins from before the rule existed never count.
 *
 * A "win" only counts if the team's pick actually improved (moves.spots > 0
 * is assumed to already be pre-filtered when the history file is authored -
 * see lottery-history.json's own comment).
 */
export function winsInWindow(team: string, lotteryYear: number, history: LotteryHistory): number {
  const windowStart = Math.max(history.rule.firstYear, lotteryYear - (history.rule.windowYears - 1));
  const windowEnd = lotteryYear - 1;

  return history.moves.filter(
    (move) => move.team === team && move.spots > 0 && move.year >= windowStart && move.year <= windowEnd
  ).length;
}

export function isEligibleToAdvance(team: string, lotteryYear: number, history: LotteryHistory): boolean {
  return winsInWindow(team, lotteryYear, history) < history.rule.maxWins;
}

/** Teams with at least one qualifying win in the window feeding `lotteryYear`, for display. */
export function teamsWithAdvanceHistory(
  lotteryYear: number,
  history: LotteryHistory
): { team: string; wins: number }[] {
  const windowStart = Math.max(history.rule.firstYear, lotteryYear - (history.rule.windowYears - 1));
  const windowEnd = lotteryYear - 1;

  const counts = new Map<string, number>();

  for (const move of history.moves) {
    if (move.spots <= 0) continue;
    if (move.year < windowStart || move.year > windowEnd) continue;
    counts.set(move.team, (counts.get(move.team) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([team, wins]) => ({ team, wins }))
    .sort((a, b) => b.wins - a.wins || a.team.localeCompare(b.team));
}

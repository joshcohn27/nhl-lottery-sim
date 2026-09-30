export interface TeamStanding {
  abbrev: string;
  name: string;
  gamesPlayed: number;
  points: number;
  pointPctg: number;
  regulationWins: number;
  row: number;
  wins: number;
  divisionAbbrev?: string;
  conferenceAbbrev?: string;
  /** 1-3 = automatic division berth if the season were over today; NHL-computed. */
  divisionSequence?: number;
  /** 1-2 = wildcard berth within the conference if the season were over today; NHL-computed. */
  wildcardSequence?: number;
}

/**
 * Worst-first comparator using the NHL's own standings tiebreaker order:
 * points % -> regulation wins -> regulation+OT wins (ROW) -> wins.
 * Falls back to team name so the sort is fully deterministic.
 */
export function compareWorstFirst(a: TeamStanding, b: TeamStanding): number {
  return (
    a.pointPctg - b.pointPctg ||
    a.regulationWins - b.regulationWins ||
    a.row - b.row ||
    a.wins - b.wins ||
    a.name.localeCompare(b.name)
  );
}

export function sortTeamsWorstFirst(teams: TeamStanding[]): TeamStanding[] {
  return [...teams].sort(compareWorstFirst);
}

/** True once every team has played out its full schedule (final standings, playoff field is known). */
export function isSeasonComplete(teams: TeamStanding[], gamesInSeason: number): boolean {
  return teams.length > 0 && teams.every((t) => t.gamesPlayed >= gamesInSeason);
}

function isPlayoffTeam(team: TeamStanding): boolean {
  if (team.divisionSequence !== undefined && team.divisionSequence <= 3) return true;
  if (team.wildcardSequence !== undefined && team.wildcardSequence >= 1 && team.wildcardSequence <= 2) return true;
  return false;
}

/**
 * Splits teams into the lottery-eligible pool and the rest.
 * Mid-season this is a projection (worst N by standings); once the season is
 * over it switches to the NHL's actual playoff qualification (division top-3 +
 * two wildcards per conference), which can differ slightly from a strict
 * worst-N cut.
 */
export function getLotteryPool(
  teams: TeamStanding[],
  lotteryTeamCount: number,
  seasonComplete: boolean
): { lotteryTeams: TeamStanding[]; otherTeams: TeamStanding[] } {
  const worstFirst = sortTeamsWorstFirst(teams);

  if (!seasonComplete) {
    return {
      lotteryTeams: worstFirst.slice(0, lotteryTeamCount),
      otherTeams: worstFirst.slice(lotteryTeamCount),
    };
  }

  const lotteryTeams = worstFirst.filter((t) => !isPlayoffTeam(t));
  const otherTeams = worstFirst.filter((t) => isPlayoffTeam(t));

  return { lotteryTeams, otherTeams };
}

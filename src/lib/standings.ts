export interface TeamStanding {
  abbrev: string;
  name: string;
  gamesPlayed: number;
  points: number;
  pointPctg: number;
  regulationWins: number;
  row: number;
  wins: number;
  losses: number;
  otLosses: number;
  goalDifferential: number;
  goalsFor: number;
  /** e.g. "W" or "L" */
  streakCode: string;
  streakCount: number;
  l10Wins: number;
  l10Losses: number;
  l10OtLosses: number;
  divisionAbbrev: string;
  conferenceAbbrev: string;
  /** True if this team would make the playoffs if the season ended today (division top-3 + 2 wildcards per conference). Computed by scripts/update-standings.mjs and read as-is here. */
  inPlayoffs: boolean;
}

/**
 * Worst-first comparator using the NHL's official tie-breaking procedure:
 * clubs are ranked by points; ties in points are broken in order by fewer
 * games played (equivalent to superior points %), more regulation wins (RW),
 * more regulation+OT wins (ROW), more total wins, goal differential, then
 * goals for. (Head-to-head record among tied clubs is the one official
 * criterion skipped here - it needs opponent-by-opponent game logs the
 * standings endpoint doesn't provide.) Falls back to team name so the sort
 * stays fully deterministic.
 *
 * Comparing raw points (not points %) first, with fewer-games-played as the
 * first tiebreaker, is what correctly ranks a team that has actually lost
 * every game it's played (0 points, GP > 0) below a team that simply hasn't
 * played yet (0 points, 0 GP) - both are tied on points, and by rule the
 * team with fewer games played (here, 0) is the one considered better.
 */
export function compareWorstFirst(a: TeamStanding, b: TeamStanding): number {
  return (
    a.points - b.points ||
    b.gamesPlayed - a.gamesPlayed ||
    a.regulationWins - b.regulationWins ||
    a.row - b.row ||
    a.wins - b.wins ||
    a.goalDifferential - b.goalDifferential ||
    a.goalsFor - b.goalsFor ||
    a.name.localeCompare(b.name)
  );
}

export function compareBestFirst(a: TeamStanding, b: TeamStanding): number {
  return -compareWorstFirst(a, b);
}

export function sortTeamsWorstFirst(teams: TeamStanding[]): TeamStanding[] {
  return [...teams].sort(compareWorstFirst);
}

/** True once every team has played out its full schedule (final standings). */
export function isSeasonComplete(teams: TeamStanding[], gamesInSeason: number): boolean {
  return teams.length > 0 && teams.every((t) => t.gamesPlayed >= gamesInSeason);
}

/**
 * "If the playoffs started today": top 3 teams in each division (by the
 * standings tiebreaker), plus the 2 best remaining teams in each conference
 * as wild cards. Pure and testable - this is the fallback path used when the
 * live standings response doesn't carry divisionSequence/wildcardSequence
 * (scripts/update-standings.mjs prefers those fields when present, since
 * they're the NHL's own live computation of the same thing).
 */
export function computePlayoffField(teams: TeamStanding[]): TeamStanding[] {
  const divisionQualifiers = new Set<string>();

  const byDivision = new Map<string, TeamStanding[]>();
  for (const team of teams) {
    const group = byDivision.get(team.divisionAbbrev) ?? [];
    group.push(team);
    byDivision.set(team.divisionAbbrev, group);
  }

  for (const divisionTeams of byDivision.values()) {
    const top3 = [...divisionTeams].sort(compareBestFirst).slice(0, 3);
    top3.forEach((team) => divisionQualifiers.add(team.abbrev));
  }

  const wildcardQualifiers = new Set<string>();

  const byConference = new Map<string, TeamStanding[]>();
  for (const team of teams) {
    const group = byConference.get(team.conferenceAbbrev) ?? [];
    group.push(team);
    byConference.set(team.conferenceAbbrev, group);
  }

  for (const conferenceTeams of byConference.values()) {
    const remaining = conferenceTeams.filter((team) => !divisionQualifiers.has(team.abbrev));
    const wildcards = [...remaining].sort(compareBestFirst).slice(0, 2);
    wildcards.forEach((team) => wildcardQualifiers.add(team.abbrev));
  }

  return teams.map((team) => ({
    ...team,
    inPlayoffs: divisionQualifiers.has(team.abbrev) || wildcardQualifiers.has(team.abbrev),
  }));
}

/**
 * Splits teams into the lottery-eligible pool (inPlayoffs = false) and the
 * rest, each worst-first. Membership comes entirely from each team's
 * inPlayoffs flag - "if the playoffs started today," recomputed on every
 * standings update - so this needs no season-complete branch: once the
 * season actually ends, the flags are simply final.
 */
export function getLotteryPool(teams: TeamStanding[]): {
  lotteryTeams: TeamStanding[];
  otherTeams: TeamStanding[];
} {
  const worstFirst = sortTeamsWorstFirst(teams);

  return {
    lotteryTeams: worstFirst.filter((t) => !t.inPlayoffs),
    otherTeams: worstFirst.filter((t) => t.inPlayoffs),
  };
}

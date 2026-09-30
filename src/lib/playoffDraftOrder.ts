import { sortTeamsWorstFirst, type TeamStanding } from "./standings";

/**
 * Real playoff results, known only after the playoffs actually conclude
 * (mid-June). Until then this is null and pick order for non-lottery teams
 * falls back to plain reverse regular-season standings.
 *
 * Per the confirmed rule: picks 17-28 go to every playoff team that did NOT
 * reach the conference final, ordered by regular-season record (no further
 * split by which round they were eliminated in); picks 29-30 go to the two
 * conference-final losers (by regular-season record); picks 31-32 go to the
 * two Stanley Cup Final teams, loser picking 31st and the champion picking
 * 32nd (last overall).
 */
export interface PlayoffResults {
  /** Abbreviations of the two teams eliminated in the conference finals. */
  conferenceFinalLosers: [string, string];
  /** Abbreviation of the Stanley Cup Final loser - picks 31st. */
  cupFinalLoser: string;
  /** Abbreviation of the Stanley Cup champion - picks 32nd (last overall). */
  cupFinalWinner: string;
}

/**
 * Orders the 16 playoff (non-lottery) teams for picks 17-32. `playoffTeams`
 * should already be worst-first by regular-season record (e.g. from
 * getLotteryPool's otherTeams). Without playoffResults, falls back to that
 * same regular-season order for all 16 slots.
 */
export function resolvePlayoffPickOrder(
  playoffTeams: TeamStanding[],
  playoffResults: PlayoffResults | null
): TeamStanding[] {
  if (!playoffResults) return playoffTeams;

  const { conferenceFinalLosers, cupFinalLoser, cupFinalWinner } = playoffResults;
  const finalistAbbrevs = new Set<string>([...conferenceFinalLosers, cupFinalLoser, cupFinalWinner]);

  const everyoneElse = playoffTeams.filter((t) => !finalistAbbrevs.has(t.abbrev));

  const confFinalLosersOrdered = sortTeamsWorstFirst(
    playoffTeams.filter((t) => conferenceFinalLosers.includes(t.abbrev))
  );

  const cupFinalLoserTeam = playoffTeams.find((t) => t.abbrev === cupFinalLoser);
  const cupFinalWinnerTeam = playoffTeams.find((t) => t.abbrev === cupFinalWinner);

  // Every named abbreviation must match a real playoff team - if any of the
  // 4 designations didn't resolve, don't silently misplace a team; fall back
  // to plain regular-season order instead.
  if (confFinalLosersOrdered.length !== 2 || !cupFinalLoserTeam || !cupFinalWinnerTeam) {
    console.warn("resolvePlayoffPickOrder: playoffResults abbreviations didn't fully match playoffTeams; falling back to regular-season order.");
    return playoffTeams;
  }

  const ordered = [...everyoneElse, ...confFinalLosersOrdered, cupFinalLoserTeam, cupFinalWinnerTeam];

  if (ordered.length !== playoffTeams.length) {
    console.warn("resolvePlayoffPickOrder: resolved order doesn't match the playoff team count; falling back to regular-season order.");
    return playoffTeams;
  }

  return ordered;
}

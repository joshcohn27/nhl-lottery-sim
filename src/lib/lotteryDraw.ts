export interface LotteryComboRow {
  id: number;
  balls: [number, number, number, number];
  /** Position 1-16 in the worst-first lottery order; mapped to an actual team at runtime. */
  slot: number;
  slotSequence: number | null;
}

export interface LotteryAssignment {
  team: string;
  pick: number;
  source: "draw" | "default";
}

export const REDRAW_COMBO = "11,12,13,14";

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

export function parseComboCsv(csv: string): LotteryComboRow[] {
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [id, ball1, ball2, ball3, ball4, slot, slotSequence] = splitCsvLine(line);

      return {
        id: Number(id),
        balls: [Number(ball1), Number(ball2), Number(ball3), Number(ball4)] as [number, number, number, number],
        // Number("") is 0, not NaN, which would make the reserved/redraw row
        // (whose slot column is blank) look like a real slot 0 downstream.
        slot: slot ? Number(slot) : NaN,
        slotSequence: slotSequence ? Number(slotSequence) : null,
      };
    });
}

export function getAliveSlots(comboRows: LotteryComboRow[], drawnSorted: number[]): Set<number> {
  const alive = new Set<number>();

  for (const row of comboRows) {
    if (drawnSorted.every((ball) => row.balls.includes(ball))) {
      alive.add(row.slot);
    }
  }

  return alive;
}

export function getPossibleFourthBallsBySlot(
  comboRows: LotteryComboRow[],
  drawnSorted: number[]
): Record<number, number[]> {
  if (drawnSorted.length !== 3) return {};

  const map: Record<number, Set<number>> = {};

  for (const row of comboRows) {
    if (!drawnSorted.every((ball) => row.balls.includes(ball))) continue;

    const missingBall = row.balls.find((ball) => !drawnSorted.includes(ball));
    if (missingBall === undefined) continue;

    if (!map[row.slot]) map[row.slot] = new Set<number>();
    map[row.slot].add(missingBall);
  }

  return Object.fromEntries(
    Object.entries(map).map(([slot, balls]) => [slot, [...balls].sort((a, b) => a - b)])
  );
}

export function resolveCombo(comboRows: LotteryComboRow[], balls: number[]): LotteryComboRow | "redraw" | null {
  const sortedKey = [...balls].sort((a, b) => a - b).join(",");

  if (sortedKey === REDRAW_COMBO) return "redraw";

  return comboRows.find((row) => row.balls.join(",") === sortedKey) ?? null;
}

export function getHighestAllowedPick(originalPick: number, maxMoveUp: number, lotteryTeamCount: number): number {
  if (originalPick <= 0) return lotteryTeamCount;
  return Math.max(1, originalPick - maxMoveUp);
}

export function getOccupiedPicks(assignments: LotteryAssignment[]): Set<number> {
  return new Set(assignments.map((assignment) => assignment.pick));
}

export function getAssignedTeams(assignments: LotteryAssignment[]): Set<string> {
  return new Set(assignments.map((assignment) => assignment.team));
}

export function getAwardedPick(
  targetPick: number,
  highestAllowedPick: number,
  occupiedPicks: Set<number>,
  lastLotteryPick: number
): number {
  const firstPossiblePick = Math.max(targetPick, highestAllowedPick);

  for (let pick = firstPossiblePick; pick <= lastLotteryPick; pick++) {
    if (!occupiedPicks.has(pick)) return pick;
  }

  return firstPossiblePick;
}

/** Did this lottery outcome actually move the team up from its pre-lottery slot? Non-improving "wins" (e.g. the worst team keeping #1) never count toward the two-in-five-year advance limit. */
export function didLotteryMoveImprovePick(originalPick: number, awardedPick: number): boolean {
  return awardedPick < originalPick;
}

export function buildLotterySlots(
  assignments: LotteryAssignment[],
  lotteryTeamNames: string[]
): Record<number, string> {
  const slots: Record<number, string> = {};
  const assignedTeams = getAssignedTeams(assignments);
  const lastLotteryPick = lotteryTeamNames.length;

  [...assignments]
    .sort((a, b) => a.pick - b.pick)
    .forEach((assignment) => {
      slots[assignment.pick] = assignment.team;
    });

  const remainingLotteryTeams = lotteryTeamNames.filter((teamName) => !assignedTeams.has(teamName));
  let remainingIdx = 0;

  for (let pick = 1; pick <= lastLotteryPick; pick++) {
    if (slots[pick]) continue;
    slots[pick] = remainingLotteryTeams[remainingIdx];
    remainingIdx++;
  }

  return slots;
}

/** Each lottery team's current pick number - the inverse of buildLotterySlots. */
export function buildLotteryPickByTeam(
  assignments: LotteryAssignment[],
  lotteryTeamNames: string[]
): Map<string, number> {
  const pickByTeam = new Map<string, number>();

  for (const [pick, team] of Object.entries(buildLotterySlots(assignments, lotteryTeamNames))) {
    pickByTeam.set(team, Number(pick));
  }

  return pickByTeam;
}

export function getNextOpenLotteryPick(assignments: LotteryAssignment[], lotteryTeamCount: number): number {
  const occupiedPicks = getOccupiedPicks(assignments);

  for (let pick = 1; pick <= lotteryTeamCount; pick++) {
    if (!occupiedPicks.has(pick)) return pick;
  }

  return lotteryTeamCount;
}

export function getDefaultTeamForPick(
  assignments: LotteryAssignment[],
  pick: number,
  lotteryTeamNames: string[]
): string | null {
  return buildLotterySlots(assignments, lotteryTeamNames)[pick] ?? null;
}

export function applyLotteryDrawAssignment(
  existingAssignments: LotteryAssignment[],
  winner: string,
  targetPick: number,
  highestAllowedPick: number,
  lotteryTeamNames: string[]
): { assignments: LotteryAssignment[]; awardedPick: number; defaultLockedTeam: string | null } {
  const occupiedPicks = getOccupiedPicks(existingAssignments);
  const awardedPick = getAwardedPick(targetPick, highestAllowedPick, occupiedPicks, lotteryTeamNames.length);
  const drawAssignment: LotteryAssignment = { team: winner, pick: awardedPick, source: "draw" };
  const withWinner = [...existingAssignments, drawAssignment];

  if (awardedPick === targetPick) {
    return { assignments: withWinner, awardedPick, defaultLockedTeam: null };
  }

  const defaultLockedTeam = getDefaultTeamForPick(withWinner, targetPick, lotteryTeamNames);

  if (!defaultLockedTeam || getAssignedTeams(withWinner).has(defaultLockedTeam)) {
    return { assignments: withWinner, awardedPick, defaultLockedTeam: null };
  }

  return {
    assignments: [...withWinner, { team: defaultLockedTeam, pick: targetPick, source: "default" }],
    awardedPick,
    defaultLockedTeam,
  };
}

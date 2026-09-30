export const DRAFT_YEAR = 2027;
export const LOTTERY_YEAR = DRAFT_YEAR;
export const PRIOR_DRAFT_YEAR = DRAFT_YEAR - 1;
export const SEASON_START_YEAR = DRAFT_YEAR - 1;
export const SEASON_LABEL = `${SEASON_START_YEAR}-${String(DRAFT_YEAR).slice(2)}`;
export const NHL_SEASON_ID = Number(`${SEASON_START_YEAR}${DRAFT_YEAR}`);

export const LOTTERY_TEAM_COUNT = 16;
export const MAX_MOVE_UP = 10;

export const LOTTERY_WIN_WINDOW_YEARS = 5;
export const LOTTERY_WIN_MAX = 2;
export const LOTTERY_WIN_RULE_FIRST_YEAR = 2022;

/** Fixed NHL draft-lottery odds table, worst team (slot 1) first. Independent of which
 * team holds each slot in a given year - only the combos.csv -> slot mapping matters. */
export const LOTTERY_ODDS_BY_SLOT = [
  18.5, 13.5, 11.5, 9.5, 8.5, 7.5, 6.5, 6.0, 5.0, 3.5, 3.0, 2.5, 2.0, 1.5, 0.5, 0.5,
];
export const LOTTERY_COMBOS_BY_SLOT = LOTTERY_ODDS_BY_SLOT.map((odds) => Math.round(odds * 10));

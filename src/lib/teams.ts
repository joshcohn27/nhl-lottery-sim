// Team identity data for display purposes (logos, fallback chips). Keep
// NAME_BY_ABBREV in sync with scripts/update-standings.mjs's copy - that one
// stays a plain duplicate since it's a separate Node script with no shared
// build step with the TS app.
export const NAME_BY_ABBREV: Record<string, string> = {
  ANA: "Anaheim", BOS: "Boston", BUF: "Buffalo", CGY: "Calgary", CAR: "Carolina",
  CHI: "Chicago", COL: "Colorado", CBJ: "Columbus", DAL: "Dallas", DET: "Detroit",
  EDM: "Edmonton", FLA: "Florida", LAK: "Los Angeles", MIN: "Minnesota",
  MTL: "Montreal", NSH: "Nashville", NJD: "New Jersey", NYI: "NY Islanders",
  NYR: "NY Rangers", OTT: "Ottawa", PHI: "Philadelphia", PIT: "Pittsburgh",
  SJS: "San Jose", SEA: "Seattle", STL: "St. Louis", TBL: "Tampa Bay",
  TOR: "Toronto", UTA: "Utah", VAN: "Vancouver", VGK: "Vegas",
  WSH: "Washington", WPG: "Winnipeg",
};

export const ABBREV_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(NAME_BY_ABBREV).map(([abbrev, name]) => [name, abbrev])
);

// Approximate primary brand colors, used only as a small fallback chip when a
// team's logo file is missing - never as a background or decorative fill.
export const TEAM_COLOR_BY_ABBREV: Record<string, string> = {
  ANA: "#F47A38", BOS: "#FFB81C", BUF: "#002654", CGY: "#C8102E", CAR: "#CC0000",
  CHI: "#CF0A2C", COL: "#6F263D", CBJ: "#002654", DAL: "#006847", DET: "#CE1126",
  EDM: "#FF4C00", FLA: "#C8102E", LAK: "#111111", MIN: "#154734", MTL: "#AF1E2D",
  NSH: "#FFB81C", NJD: "#CE1126", NYI: "#00539B", NYR: "#0038A8", OTT: "#C52032",
  PHI: "#F74902", PIT: "#FCB514", SJS: "#006D75", SEA: "#001628", STL: "#002F87",
  TBL: "#002868", TOR: "#00205B", UTA: "#6CACE4", VAN: "#00205B", VGK: "#B4975A",
  WSH: "#C8102E", WPG: "#041E42",
};

export function abbrevForTeamName(name: string): string | undefined {
  return ABBREV_BY_NAME[name];
}

export interface Prospect {
  rank: number;
  name: string;
  pos: string;
  league: string;
  team?: string;
  /** Verified Elite Prospects profile URL, when we have one on file. */
  epUrl?: string;
}

export type ProspectPositionFilter = "all" | "centers" | "wingers" | "forwards" | "defense" | "goalies";

export function splitCsvLine(line: string): string[] {
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

export function parseProspectsCsv(csv: string): Prospect[] {
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [rank, name, pos, league, team, epUrl] = splitCsvLine(line);

      return {
        rank: Number(rank),
        name,
        pos,
        league: league ?? "",
        team: team || undefined,
        epUrl: epUrl || undefined,
      };
    })
    .filter((prospect) => Number.isFinite(prospect.rank) && prospect.name)
    .sort((a, b) => a.rank - b.rank);
}

/**
 * The prospect's verified Elite Prospects profile when we have one on file,
 * otherwise an EP search pre-filled with their name - always a valid link,
 * even for the ones we haven't individually verified.
 */
export function eliteProspectsUrl(prospect: Prospect): string {
  if (prospect.epUrl) return prospect.epUrl;
  return `https://www.eliteprospects.com/search/player?q=${encodeURIComponent(prospect.name)}`;
}

export function prospectMatchesPositionFilter(prospect: Prospect, filter: ProspectPositionFilter): boolean {
  if (filter === "all") return true;

  const tokens = prospect.pos
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);

  const hasCenter = tokens.includes("C");
  const hasWing = tokens.includes("LW") || tokens.includes("RW") || tokens.includes("W");
  const hasForward = tokens.includes("F") || hasCenter || hasWing;
  const hasDefense = tokens.includes("D") || tokens.includes("LD") || tokens.includes("RD");
  const hasGoalie = tokens.includes("G");

  if (filter === "centers") return hasCenter;
  if (filter === "wingers") return hasWing;
  if (filter === "forwards") return hasForward;
  if (filter === "defense") return hasDefense;
  if (filter === "goalies") return hasGoalie;

  return true;
}

export function formatProspectMeta(prospect: Prospect): string {
  return [prospect.pos, prospect.league, prospect.team].filter(Boolean).join(" · ");
}

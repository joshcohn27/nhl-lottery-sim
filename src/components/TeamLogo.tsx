import { useState } from "react";
import { abbrevForTeamName, TEAM_COLOR_BY_ABBREV } from "../lib/teams";

const LOGO_ASPECT = 1.5;

interface TeamLogoProps {
  teamName: string;
  size?: number;
  lazy?: boolean;
}

/**
 * Renders a team's self-hosted logo (public/logos/{ABBREV}.svg). The logo files
 * are all 3:2 canvases, so `size` is the height and the box is 1.5x as wide -
 * a square box would letterbox the artwork down to two-thirds size. Falls back to
 * a small colored abbreviation chip - never a broken image - if the team
 * can't be resolved to an abbreviation, or the logo file 404s.
 */
export function TeamLogo({ teamName, size, lazy = true }: TeamLogoProps) {
  const abbrev = abbrevForTeamName(teamName);
  const [failed, setFailed] = useState(false);
  const width = size ? Math.round(size * LOGO_ASPECT) : undefined;
  const style = size ? { width, height: size, flex: `0 0 ${width}px` } : undefined;

  if (!abbrev || failed) {
    const chipText = (abbrev ?? teamName.slice(0, 2)).slice(0, 3).toUpperCase();
    const background = abbrev ? TEAM_COLOR_BY_ABBREV[abbrev] : undefined;

    return (
      <span
        className="team-logo-chip"
        style={{ ...style, height: width, background: background ?? "#6b6b75" }}
        role="img"
        aria-label={`${teamName} logo`}
        title={teamName}
      >
        {chipText}
      </span>
    );
  }

  return (
    <img
      className="team-logo"
      style={style}
      src={`/logos/${abbrev}.svg`}
      alt={`${teamName} logo`}
      loading={lazy ? "lazy" : "eager"}
      width={width}
      height={size}
      onError={() => setFailed(true)}
    />
  );
}

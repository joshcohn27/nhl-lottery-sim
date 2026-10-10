import { TeamLogo } from "./TeamLogo";
import { abbrevForTeamName } from "../lib/teams";
import { MULTI_RECIPIENT_SEPARATOR } from "../lib/pickTrades";

/**
 * Renders a draft-pick's "team" cell. When the pick's note records a
 * "(via X...)" trade, shows the original team (whose standings slot this is)
 * at normal weight, a circular arrow, then the recipient as a compact
 * abbreviation + logo - or, for a genuinely split pick (team value joined
 * with "/"), both recipients' abbreviation + logo. Synthetic labels like
 * "Toronto (pending: Boston or Philadelphia)" render as plain muted text
 * since they aren't a resolved team.
 */
export function TradedPickTeam({ team, note }: { team: string; note: string }) {
  const isPending = team.includes("(pending");
  if (isPending) {
    return <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>{team}</span>;
  }

  const viaMatch = note.match(/^\(via ([^,)]+)/);
  if (!viaMatch) {
    return (
      <span className="team-cell">
        <TeamLogo teamName={team} size={22} />
        <span>{team}</span>
      </span>
    );
  }

  const originalTeam = viaMatch[1];
  const recipients = team.split(MULTI_RECIPIENT_SEPARATOR);

  return (
    <span className="team-cell" title={note}>
      <TeamLogo teamName={originalTeam} size={22} />
      <span>{originalTeam}</span>
      <span className="trade-arrow" aria-hidden="true">
        &#8635;
      </span>
      {recipients.map((recipient, idx) => (
        <span className="trade-recipient-group" key={recipient}>
          {idx > 0 && <span className="trade-recipient-sep">/</span>}
          <span className="trade-recipient">{abbrevForTeamName(recipient) ?? recipient}</span>
          <TeamLogo teamName={recipient} size={18} />
        </span>
      ))}
    </span>
  );
}

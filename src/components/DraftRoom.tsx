import { useEffect, useRef, type ReactNode } from "react";
import { TeamLogo } from "./TeamLogo";
import { abbrevForTeamName } from "../lib/teams";
import { MULTI_RECIPIENT_SEPARATOR } from "../lib/pickTrades";
import { formatProspectMeta, type Prospect, type ProspectPositionFilter } from "../lib/prospects";
import "./DraftRoom.css";

export interface DraftRoomPick {
  pick: number;
  team: string;
  note: string;
  player: Prospect | null;
  forfeited?: boolean;
}

/**
 * Layout for one round of the mock draft. Purely presentational: every
 * decision (who is on the clock, what each button does, when controls are
 * disabled) is made by the caller and passed in unchanged.
 */
interface DraftRoomProps {
  title: string;
  picks: DraftRoomPick[];
  isOnClock: (idx: number) => boolean;
  onClockPick: DraftRoomPick | undefined;
  isComplete: boolean;
  actions: ReactNode;
  completeTitle: string;
  completeText: string;
  teamPicks: DraftRoomPick[];
  prospects: Prospect[];
  selectedProspect: Prospect | null;
  onSelectProspect: (prospect: Prospect) => void;
  search: string;
  onSearchChange: (value: string) => void;
  positionFilter: ProspectPositionFilter;
  onPositionFilterChange: (value: ProspectPositionFilter) => void;
  controlsDisabled: boolean;
  onDraft: () => void;
  draftDisabled: boolean;
  draftLabel: string;
  onAutoNext: () => void;
  autoNextDisabled: boolean;
  /** False while a team the user isn't controlling is on the clock. */
  isUserPick: boolean;
  /** Seconds left on the pick timer, or null when there's no timer running. */
  clockSecondsLeft: number | null;
}

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const POSITION_TABS: { value: ProspectPositionFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "centers", label: "C" },
  { value: "wingers", label: "W" },
  { value: "forwards", label: "F" },
  { value: "defense", label: "D" },
  { value: "goalies", label: "G" },
];

function shortTeam(team: string): string {
  return team
    .split(MULTI_RECIPIENT_SEPARATOR)
    .map((name) => abbrevForTeamName(name) ?? name)
    .join("/");
}

function viaTeam(note: string): string | undefined {
  return note.match(/^\(via ([^,)]+)/)?.[1];
}

export function DraftRoom(props: DraftRoomProps) {
  const { picks, isOnClock, onClockPick, isComplete } = props;
  const stripRef = useRef<HTMLDivElement>(null);
  const onClockIdx = picks.findIndex((_, idx) => isOnClock(idx));

  // Keep the pick on the clock centered in the draft-order strip.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || onClockIdx < 0) return;
    const cell = strip.querySelector<HTMLElement>(`[data-idx="${onClockIdx}"]`);
    if (!cell) return;
    strip.scrollTo({
      left: cell.offsetLeft - strip.clientWidth / 2 + cell.offsetWidth / 2,
      behavior: "smooth",
    });
  }, [onClockIdx]);

  const onClockVia = onClockPick ? viaTeam(onClockPick.note) : undefined;

  return (
    <div className="dr">
      <div className="dr-head">
        <div>
          <h2 className="dr-title">{props.title}</h2>
          <div className="dr-status">
            {isComplete
              ? `${props.completeTitle} · ${props.completeText}`
              : onClockPick
                ? `Pick ${onClockPick.pick} · ${onClockPick.team} on the clock`
                : ""}
          </div>
        </div>
        <div className="dr-actions">{props.actions}</div>
      </div>

      {/* Once the round is done the results list below replaces the strip. */}
      <div className={`dr-strip${isComplete ? " is-hidden" : ""}`} ref={stripRef}>
        {picks.map((pick, idx) => {
          const onClock = isOnClock(idx);
          const via = viaTeam(pick.note);
          return (
            <div
              key={`${pick.pick}-${pick.team}`}
              data-idx={idx}
              className={`dr-cell${onClock ? " is-on-clock" : ""}${pick.player ? " is-done" : ""}${pick.forfeited ? " is-forfeited" : ""}`}
              title={pick.note || undefined}
            >
              <div className="dr-cell-top">
                <span className="dr-cell-num">{pick.pick}</span>
                {pick.forfeited ? (
                  <span className="dr-cell-team">Forfeited</span>
                ) : (
                  <>
                    <TeamLogo teamName={pick.team.split(MULTI_RECIPIENT_SEPARATOR)[0]} size={14} />
                    <span className="dr-cell-team">{shortTeam(pick.team)}</span>
                    {via && <span className="dr-cell-via">via {shortTeam(via)}</span>}
                  </>
                )}
              </div>
              <div className="dr-cell-player">
                {onClock ? "On the clock" : pick.player ? pick.player.name : "—"}
              </div>
            </div>
          );
        })}
      </div>

      {isComplete ? (
        <div className="dr-complete">
          <ol className="dr-results">
            {picks.map((pick) => (
              <li key={`${pick.pick}-${pick.team}`} className={pick.forfeited ? "is-forfeited" : ""}>
                <span className="dr-num">{pick.pick}</span>
                {pick.forfeited ? (
                  <span className="dr-muted">Forfeited</span>
                ) : (
                  <>
                    <TeamLogo teamName={pick.team.split(MULTI_RECIPIENT_SEPARATOR)[0]} size={16} />
                    <span className="dr-results-team">{shortTeam(pick.team)}</span>
                    <span className="dr-results-player">
                      {pick.player ? pick.player.name : "—"}
                      {pick.player && <span className="dr-muted"> {pick.player.pos}</span>}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="dr-main">
          <section className="dr-board">
            <div className="dr-filters">
              <div className="dr-tabs" role="tablist" aria-label="Position">
                {POSITION_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={props.positionFilter === tab.value}
                    className={`dr-tab${props.positionFilter === tab.value ? " is-active" : ""}`}
                    onClick={() => props.onPositionFilterChange(tab.value)}
                    disabled={props.controlsDisabled}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <input
                className="dr-search"
                placeholder="Search prospects"
                value={props.search}
                onChange={(e) => props.onSearchChange(e.target.value)}
                disabled={props.controlsDisabled}
              />
            </div>
            <div className="dr-count">{props.prospects.length} available</div>
            <ul className="dr-prospects">
              {props.prospects.map((prospect) => {
                const selected = props.selectedProspect?.rank === prospect.rank;
                return (
                  <li
                    key={prospect.rank}
                    className={`dr-prospect${selected ? " is-selected" : ""}`}
                    onClick={() => props.onSelectProspect(prospect)}
                  >
                    <span className="dr-num">{prospect.rank}</span>
                    <span className="dr-prospect-name">
                      {prospect.name}
                      <span className="dr-prospect-meta">{formatProspectMeta(prospect)}</span>
                    </span>
                    {selected && props.isUserPick && (
                      <button
                        type="button"
                        className="btn dr-inline-draft"
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onDraft();
                        }}
                        disabled={props.draftDisabled}
                      >
                        Draft
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <aside className="dr-side">
            {onClockPick && (
              <div className="dr-team">
                <TeamLogo teamName={onClockPick.team.split(MULTI_RECIPIENT_SEPARATOR)[0]} size={30} />
                <div>
                  <div className="dr-team-name">{onClockPick.team}</div>
                  <div className="dr-muted">
                    Pick {onClockPick.pick}
                    {onClockVia ? ` · via ${onClockVia}` : ""}
                  </div>
                </div>
              </div>
            )}
            {props.clockSecondsLeft !== null && (
              <div className={`dr-clock${props.clockSecondsLeft <= 10 ? " is-low" : ""}`} aria-live="polite">
                {formatClock(props.clockSecondsLeft)}
              </div>
            )}
            {props.isUserPick ? (
              <>
                <button type="button" className="btn dr-wide" onClick={props.onDraft} disabled={props.draftDisabled}>
                  {props.draftLabel}
                </button>
                <button
                  type="button"
                  className="btn btn-outline dr-wide"
                  onClick={props.onAutoNext}
                  disabled={props.autoNextDisabled}
                >
                  Auto-Pick Next
                </button>
              </>
            ) : (
              <div className="dr-auto-note">Auto-picking for {onClockPick?.team}…</div>
            )}

            {props.teamPicks.length > 0 && (
              <>
                <div className="dr-side-label">{onClockPick?.team}'s picks</div>
                <ul className="dr-team-picks">
                  {props.teamPicks.map((pick) => (
                    <li key={pick.pick} className={pick.pick === onClockPick?.pick ? "is-current" : ""}>
                      <span className="dr-num">{pick.pick}</span>
                      <span>
                        {pick.player ? pick.player.name : pick.pick === onClockPick?.pick ? "On the clock" : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

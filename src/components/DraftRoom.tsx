import { useEffect, useRef, useState, type ReactNode } from "react";
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
 * disabled) is made by the caller and passed in unchanged. The only state
 * kept here is display preference: favorites and the board filters.
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
  /** Prospects still available that match the search and position filter. */
  prospects: Prospect[];
  /** Every prospect that matches the search and position filter, drafted or not. */
  matchingProspects: Prospect[];
  /** Who took each drafted prospect, by prospect rank. */
  draftedBy: Map<number, { pick: number; team: string }>;
  search: string;
  onSearchChange: (value: string) => void;
  positionFilter: ProspectPositionFilter;
  onPositionFilterChange: (value: ProspectPositionFilter) => void;
  controlsDisabled: boolean;
  onDraftProspect: (prospect: Prospect) => void;
  draftDisabled: boolean;
  /** False while a team the user isn't controlling is on the clock. */
  isUserPick: boolean;
  /** Seconds left on the pick timer, or null when there's no timer running. */
  clockSecondsLeft: number | null;
}

// Saved by name, not rank: rankings get reordered, and a saved rank would
// silently point at a different player.
const FAVORITES_STORAGE_KEY = "nhl-mock-favorites";

function loadFavorites(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((n) => typeof n === "string") : []);
  } catch {
    return new Set();
  }
}

/** Favorited prospects, remembered in this browser across rounds and visits. */
function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);

  const toggle = (name: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Storage unavailable (private mode etc.): favorites last for this visit only.
      }
      return next;
    });
  };

  return { favorites, toggle };
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

/** How a drafted player is shown in the room: "C - Alexis Joseph". */
function draftedLabel(player: Prospect): string {
  return `${player.pos} - ${player.name}`;
}

function viaTeam(note: string): string | undefined {
  return note.match(/^\(via ([^,)]+)/)?.[1];
}

export function DraftRoom(props: DraftRoomProps) {
  const { picks, isOnClock, onClockPick, isComplete } = props;
  const stripRef = useRef<HTMLDivElement>(null);
  const onClockIdx = picks.findIndex((_, idx) => isOnClock(idx));
  const { favorites, toggle: toggleFavorite } = useFavorites();
  const [showDrafted, setShowDrafted] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // Scroll the draft-order strip so the most recent pick sits fully at the
  // left edge, with the pick on the clock right after it.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || onClockIdx < 0) return;
    const cell = strip.querySelector<HTMLElement>(`[data-idx="${Math.max(onClockIdx - 1, 0)}"]`);
    if (!cell) return;
    // The strip is position: relative, so offsetLeft is measured from its edge.
    strip.scrollTo({ left: cell.offsetLeft, behavior: "smooth" });
  }, [onClockIdx]);

  const onClockVia = onClockPick ? viaTeam(onClockPick.note) : undefined;

  // "Drafted" adds already-taken players back into the list; "Favorites"
  // narrows to starred players. Both can be on at once.
  const boardProspects = (showDrafted ? props.matchingProspects : props.prospects).filter(
    (prospect) => !favoritesOnly || favorites.has(prospect.name)
  );

  const draftedTeamPicks = props.teamPicks.filter((pick) => pick.player);
  const upcomingTeamPicks = props.teamPicks.filter((pick) => !pick.player);

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
              title={[pick.player && draftedLabel(pick.player), pick.note].filter(Boolean).join(" · ") || undefined}
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
                {onClock ? "On the clock" : pick.player ? draftedLabel(pick.player) : "—"}
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
                      {pick.player ? draftedLabel(pick.player) : "—"}
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
            <div className="dr-toggles">
              <button
                type="button"
                className={`dr-toggle${showDrafted ? " is-active" : ""}`}
                aria-pressed={showDrafted}
                onClick={() => setShowDrafted((on) => !on)}
              >
                Drafted
              </button>
              <button
                type="button"
                className={`dr-toggle${favoritesOnly ? " is-active" : ""}`}
                aria-pressed={favoritesOnly}
                onClick={() => setFavoritesOnly((on) => !on)}
              >
                <span aria-hidden="true">{favoritesOnly ? "★" : "☆"}</span> Favorites
              </button>
              <span className="dr-count">
                {boardProspects.length} player{boardProspects.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="dr-prospects">
              {boardProspects.map((prospect) => {
                const drafted = props.draftedBy.get(prospect.rank);
                const favorite = favorites.has(prospect.name);
                return (
                  <li key={prospect.rank} className={`dr-prospect${drafted ? " is-drafted" : ""}`}>
                    <span className="dr-num">{prospect.rank}</span>
                    <span className="dr-prospect-name">
                      {prospect.name}
                      <span className="dr-prospect-meta">{formatProspectMeta(prospect)}</span>
                    </span>
                    <button
                      type="button"
                      className={`dr-star${favorite ? " is-on" : ""}`}
                      aria-pressed={favorite}
                      aria-label={favorite ? `Remove ${prospect.name} from favorites` : `Favorite ${prospect.name}`}
                      title={favorite ? "Remove from favorites" : "Add to favorites"}
                      onClick={() => toggleFavorite(prospect.name)}
                    >
                      {favorite ? "★" : "☆"}
                    </button>
                    {drafted ? (
                      <span className="dr-drafted-by">
                        Pick {drafted.pick} · {shortTeam(drafted.team)}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn dr-row-draft"
                        onClick={() => props.onDraftProspect(prospect)}
                        disabled={props.draftDisabled || !props.isUserPick}
                      >
                        Draft
                      </button>
                    )}
                  </li>
                );
              })}
              {boardProspects.length === 0 && (
                <li className="dr-empty">
                  {favoritesOnly ? "No favorites here yet. Tap ☆ on a player to add one." : "No players match."}
                </li>
              )}
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
                {props.clockSecondsLeft !== null && (
                  <div className={`dr-clock${props.clockSecondsLeft <= 10 ? " is-low" : ""}`} aria-live="polite">
                    {formatClock(props.clockSecondsLeft)}
                  </div>
                )}
              </div>
            )}
            {!props.isUserPick && <div className="dr-auto-note">Auto-picking for {onClockPick?.team}…</div>}

            <div className="dr-side-label">Drafted</div>
            {draftedTeamPicks.length > 0 ? (
              <ul className="dr-team-picks">
                {draftedTeamPicks.map((pick) => (
                  <li key={pick.pick}>
                    <span className="dr-num">{pick.pick}</span>
                    <span>
                      {pick.player && draftedLabel(pick.player)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="dr-side-empty">No picks made yet.</div>
            )}

            <div className="dr-side-label">Upcoming</div>
            {upcomingTeamPicks.length > 0 ? (
              <ul className="dr-team-picks">
                {upcomingTeamPicks.map((pick) => (
                  <li key={pick.pick} className={pick.pick === onClockPick?.pick ? "is-current" : ""}>
                    <span className="dr-num">{pick.pick}</span>
                    <span>{pick.pick === onClockPick?.pick ? "On the clock" : "—"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="dr-side-empty">No more picks.</div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

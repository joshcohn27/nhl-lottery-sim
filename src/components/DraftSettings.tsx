import { TeamLogo } from "./TeamLogo";
import { abbrevForTeamName } from "../lib/teams";

const TIMER_OPTIONS = [15, 30, 45, 60, 90, 120];

const DIVISION_NAMES: Record<string, string> = {
  A: "Atlantic",
  C: "Central",
  M: "Metropolitan",
  P: "Pacific",
};

export interface SettingsTeam {
  name: string;
  divisionAbbrev: string;
  /** This team's earliest pick in the draft, if it has one. */
  firstPick: number | null;
  pickCount: number;
}

interface DraftSettingsProps {
  rounds: 1 | 2;
  onRoundsChange: (rounds: 1 | 2) => void;
  teams: SettingsTeam[];
  /** null means every team is controlled by the user. */
  controlledTeams: string[] | null;
  onControlledTeamsChange: (teams: string[] | null) => void;
  timerEnabled: boolean;
  onTimerEnabledChange: (enabled: boolean) => void;
  timerSeconds: number;
  onTimerSecondsChange: (seconds: number) => void;
  onStart: () => void;
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="ds-segmented">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={`dr-tab${option.value === value ? " is-active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function DraftSettings(props: DraftSettingsProps) {
  const allNames = props.teams.map((team) => team.name);
  const isSelected = (name: string) => props.controlledTeams === null || props.controlledTeams.includes(name);
  const selectedCount = props.controlledTeams === null ? allNames.length : props.controlledTeams.length;

  const toggle = (name: string) => {
    const current = props.controlledTeams ?? allNames;
    const next = current.includes(name) ? current.filter((t) => t !== name) : [...current, name];
    props.onControlledTeamsChange(next.length === allNames.length ? null : next);
  };

  const divisions = Object.keys(DIVISION_NAMES)
    .map((abbrev) => ({
      abbrev,
      teams: props.teams
        .filter((team) => team.divisionAbbrev === abbrev)
        .sort((a, b) => (abbrevForTeamName(a.name) ?? a.name).localeCompare(abbrevForTeamName(b.name) ?? b.name)),
    }))
    .filter((division) => division.teams.length > 0);

  const selectionSummary =
    selectedCount === 0
      ? "No teams selected"
      : selectedCount === allNames.length
        ? "You're making every pick"
        : `${selectedCount} team${selectedCount === 1 ? "" : "s"} selected · every other team picks automatically`;

  return (
    <div className="ds">
      <h2 className="ds-title">Draft settings</h2>

      <div className="ds-row">
        <div className="ds-label">Rounds</div>
        <Segmented
          value={props.rounds}
          options={[
            { value: 1, label: "1 Round" },
            { value: 2, label: "2 Rounds" },
          ]}
          onChange={props.onRoundsChange}
        />
      </div>

      <div className="ds-row">
        <div className="ds-label">
          Pick timer
          <span className="ds-hint">When time runs out, your pick is made automatically.</span>
        </div>
        <div className="ds-inline">
          <Segmented
            value={props.timerEnabled ? "on" : "off"}
            options={[
              { value: "off", label: "Off" },
              { value: "on", label: "On" },
            ]}
            onChange={(value) => props.onTimerEnabledChange(value === "on")}
          />
          {props.timerEnabled && (
            <select
              className="dr-search ds-select"
              value={props.timerSeconds}
              onChange={(e) => props.onTimerSecondsChange(Number(e.target.value))}
              aria-label="Seconds per pick"
            >
              {TIMER_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds} seconds
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="ds-teams-head">
        <div className="ds-label">Select your team(s)</div>
        <div className="ds-links">
          <button type="button" onClick={() => props.onControlledTeamsChange(null)}>
            Select All
          </button>
          <span aria-hidden="true">|</span>
          <button type="button" onClick={() => props.onControlledTeamsChange([])}>
            Clear
          </button>
        </div>
      </div>

      <div className="ds-divisions">
        {divisions.map((division) => (
          <div className="ds-division" key={division.abbrev}>
            <div className="ds-division-name">{DIVISION_NAMES[division.abbrev]}</div>
            <div className="ds-division-teams">
              {division.teams.map((team) => {
                const selected = isSelected(team.name);
                return (
                  <button
                    key={team.name}
                    type="button"
                    className={`ds-team${selected ? " is-selected" : ""}`}
                    aria-pressed={selected}
                    title={team.name}
                    onClick={() => toggle(team.name)}
                  >
                    {team.firstPick !== null && <span className="ds-team-first">#{team.firstPick}</span>}
                    <TeamLogo teamName={team.name} size={26} />
                    <span className="ds-team-abbrev">{abbrevForTeamName(team.name) ?? team.name}</span>
                    <span className="ds-team-picks">
                      {team.pickCount} pick{team.pickCount === 1 ? "" : "s"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="ds-summary">{selectionSummary}</div>

      <div className="ds-start">
        <button type="button" className="btn" onClick={props.onStart} disabled={selectedCount === 0}>
          Start Draft
        </button>
        {selectedCount === 0 && <span className="ds-hint">Select at least one team.</span>}
      </div>
    </div>
  );
}

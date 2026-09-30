import { useEffect, useMemo, useState } from "react";
import { DRAFT_YEAR, LOTTERY_COMBOS_BY_SLOT, LOTTERY_TEAM_COUNT, MAX_MOVE_UP } from "../lib/config";
import { getLotteryPool, type TeamStanding } from "../lib/standings";
import { computeFullLotteryOddsMatrix } from "../lib/lotteryOdds";
import { TeamLogo } from "../components/TeamLogo";

const STANDINGS_JSON_PATH = "/data/standings.json";

interface StandingsFile {
  provisional: boolean;
  teams: TeamStanding[];
}

function formatCellPct(probability: number): string {
  const pct = probability * 100;
  if (pct <= 0) return "";
  if (pct < 0.05) return ">0.0";
  return pct.toFixed(1);
}

export default function PickOddsPage() {
  const [standingsFile, setStandingsFile] = useState<StandingsFile | null>(null);

  useEffect(() => {
    fetch(STANDINGS_JSON_PATH)
      .then((res) => res.json())
      .then(setStandingsFile)
      .catch(() => undefined);
  }, []);

  const lotteryTeams = useMemo(() => {
    if (!standingsFile) return [];
    return getLotteryPool(standingsFile.teams).lotteryTeams;
  }, [standingsFile]);

  const matrix = useMemo(
    () => computeFullLotteryOddsMatrix(LOTTERY_COMBOS_BY_SLOT, MAX_MOVE_UP, LOTTERY_TEAM_COUNT),
    []
  );

  return (
    <div className="container">
      <div className="page-title-frame">
        <h1 className="page-title">{DRAFT_YEAR} NHL Draft Lottery Odds</h1>
      </div>
      <p style={{ textAlign: "center", color: "var(--color-text-muted)", marginBottom: "var(--space-1)" }}>
        This table shows the percent chance to end up with each pick after the lottery.
      </p>
      <p
        style={{
          textAlign: "center",
          color: "var(--color-text-muted)",
          fontSize: "var(--font-size-sm)",
          marginBottom: "var(--space-6)",
        }}
      >
        The last column shows the expected value, or average pick position, for each seed.
      </p>

      {lotteryTeams.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--color-text-muted)" }}>Loading...</p>
      ) : (
        <div className="stat-table-scroll" style={{ paddingBottom: "var(--space-10)" }}>
          <table className="stat-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Team</th>
                {Array.from({ length: LOTTERY_TEAM_COUNT }, (_, i) => (
                  <th key={i} style={{ textAlign: "right" }}>
                    {i + 1}
                  </th>
                ))}
                <th style={{ textAlign: "right" }}>Avg</th>
              </tr>
            </thead>
            <tbody>
              {lotteryTeams.map((team, idx) => {
                const row = matrix[idx];
                const maxProb = Math.max(...row.probabilityByPick);

                return (
                  <tr key={team.abbrev}>
                    <td>{idx + 1}</td>
                    <td>
                      <span className="team-cell">
                        <TeamLogo teamName={team.name} size={22} />
                        <span>{team.name}</span>
                      </span>
                    </td>
                    {row.probabilityByPick.map((probability, pickIdx) => (
                      <td
                        key={pickIdx}
                        className={probability === maxProb && probability > 0 ? "tint-col" : undefined}
                        style={{ textAlign: "right", fontWeight: probability === maxProb ? 700 : 400 }}
                      >
                        {formatCellPct(probability)}
                      </td>
                    ))}
                    <td style={{ textAlign: "right", fontWeight: 700, color: "var(--color-purple)" }}>
                      {row.averagePick.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

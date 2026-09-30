import { useEffect, useMemo, useState } from "react";
import { DRAFT_YEAR, LOTTERY_TEAM_COUNT } from "../lib/config";
import { getLotteryPool, type TeamStanding } from "../lib/standings";
import { applyRound1Overlay, applyRound2Overlay, type Round1Rule, type Round2Rule } from "../lib/pickTrades";
import { resolvePlayoffPickOrder, type PlayoffResults } from "../lib/playoffDraftOrder";
import { TradedPickTeam } from "../components/TradedPickTeam";

const STANDINGS_JSON_PATH = "/data/standings.json";
const PICK_TRADES_JSON_PATH = "/data/pick-trades.json";
const PLAYOFF_RESULTS_JSON_PATH = "/data/playoff-results.json";

interface StandingsFile {
  updated: string | null;
  provisional: boolean;
  teams: TeamStanding[];
}

interface PickTradesFile {
  round1: Round1Rule[];
  round2: Round2Rule[];
}

interface OrderPick {
  pick: number;
  team: string;
  note: string;
}

function OrderColumn({ picks, title }: { picks: OrderPick[]; title: string }) {
  return (
    <div>
      <div
        style={{
          fontWeight: 800,
          color: "var(--color-purple)",
          borderBottom: "2px solid var(--color-divider)",
          paddingBottom: "var(--space-2)",
          marginBottom: "var(--space-2)",
        }}
      >
        {title}
      </div>
      {picks.map((pick) => (
        <div
          key={pick.pick}
          style={{
            display: "grid",
            gridTemplateColumns: "34px 1fr",
            gap: "var(--space-2)",
            alignItems: "center",
            padding: "var(--space-1) 0",
            borderBottom: "1px solid var(--color-divider)",
          }}
        >
          <span style={{ color: "var(--color-purple)", fontWeight: 700 }}>{pick.pick}</span>
          <TradedPickTeam team={pick.team} note={pick.note} />
        </div>
      ))}
    </div>
  );
}

export default function FullOrderPage() {
  const [standingsFile, setStandingsFile] = useState<StandingsFile | null>(null);
  const [pickTrades, setPickTrades] = useState<PickTradesFile | null>(null);
  const [playoffResults, setPlayoffResults] = useState<PlayoffResults | null>(null);

  useEffect(() => {
    fetch(STANDINGS_JSON_PATH)
      .then((res) => res.json())
      .then(setStandingsFile)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch(PICK_TRADES_JSON_PATH)
      .then((res) => res.json())
      .then(setPickTrades)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch(PLAYOFF_RESULTS_JSON_PATH)
      .then((res) => res.json())
      .then((data) => setPlayoffResults(data.results))
      .catch(() => undefined);
  }, []);

  const { round1, round2 } = useMemo(() => {
    if (!standingsFile || !pickTrades) return { round1: [], round2: [] };

    const { lotteryTeams, otherTeams } = getLotteryPool(standingsFile.teams);
    const playoffOrder = resolvePlayoffPickOrder(otherTeams, playoffResults);

    const round1Base: OrderPick[] = [
      ...lotteryTeams.map((t, idx) => ({ pick: idx + 1, team: t.name, note: "" })),
      ...playoffOrder.map((t, idx) => ({ pick: LOTTERY_TEAM_COUNT + idx + 1, team: t.name, note: "" })),
    ];
    const round1Picks = applyRound1Overlay(round1Base, pickTrades.round1);

    const round2Base: OrderPick[] = [
      ...lotteryTeams.map((t, idx) => ({ pick: LOTTERY_TEAM_COUNT * 2 + idx + 1, team: t.name, note: "" })),
      ...playoffOrder.map((t, idx) => ({ pick: LOTTERY_TEAM_COUNT * 3 + idx + 1, team: t.name, note: "" })),
    ];
    const round2Picks = applyRound2Overlay(round2Base, pickTrades.round2);

    return { round1: round1Picks, round2: round2Picks };
  }, [standingsFile, pickTrades, playoffResults]);

  return (
    <div className="container">
      <div className="page-title-frame">
        <h1 className="page-title">{DRAFT_YEAR} NHL Draft Order</h1>
      </div>
      <p
        style={{
          textAlign: "center",
          color: "var(--color-text-muted)",
          fontSize: "var(--font-size-sm)",
          marginBottom: "var(--space-6)",
        }}
      >
        {standingsFile?.provisional
          ? "Projected order, seeded from last season's final standings."
          : "Projected order based on current standings."}{" "}
        Round 1 reflects the standings-based default (no lottery simulated here) with known trades applied.
        {playoffResults
          ? " Playoff teams (picks 17-32) are ordered by how far they advanced."
          : " Playoff teams (picks 17-32) are shown by regular-season record until this year's playoff results are known."}
      </p>

      {round1.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--color-text-muted)" }}>Loading...</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--space-8)",
            paddingBottom: "var(--space-10)",
          }}
          className="full-order-grid"
        >
          <OrderColumn picks={round1} title="1st Round" />
          <OrderColumn picks={round2} title="2nd Round" />
        </div>
      )}
    </div>
  );
}

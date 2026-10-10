import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  DRAFT_YEAR,
  LOTTERY_COMBOS_BY_SLOT,
  LOTTERY_EFFECTIVE_PICK1_ODDS_BY_SLOT,
  LOTTERY_ODDS_BY_SLOT,
  LOTTERY_TEAM_COUNT,
  MAX_MOVE_UP,
  SEASON_LABEL,
} from "../lib/config";
import { getLotteryPool, isSeasonComplete, type TeamStanding } from "../lib/standings";
import { resolvePlayoffPickOrder, type PlayoffResults } from "../lib/playoffDraftOrder";
import {
  applyRound1Overlay,
  applyRound2Overlay,
  type Round1Rule,
  type Round2Rule,
} from "../lib/pickTrades";
import {
  isEligibleToAdvance,
  teamsWithAdvanceHistory,
  type LotteryHistory,
} from "../lib/lotteryEligibility";
import {
  applyLotteryDrawAssignment,
  didLotteryMoveImprovePick,
  getAwardedPick,
  getHighestAllowedPick,
  getNextOpenLotteryPick,
  getOccupiedPicks,
  parseComboCsv,
  resolveCombo,
  getAliveSlots,
  getPossibleFourthBallsBySlot,
  buildLotterySlots,
  type LotteryAssignment,
  type LotteryComboRow,
} from "../lib/lotteryDraw";
import { TradedPickTeam } from "../components/TradedPickTeam";
import { Tooltip } from "../components/Tooltip";
import { abbrevForTeamName } from "../lib/teams";
import {
  formatProspectMeta,
  parseProspectsCsv,
  prospectMatchesPositionFilter,
  type Prospect,
  type ProspectPositionFilter,
} from "../lib/prospects";
import "./LotteryPage.css";

interface StandingsFile {
  updated: string | null;
  seasonId: number;
  provisional: boolean;
  provisionalNote?: string;
  teams: TeamStanding[];
}

interface PickTradesFile {
  round1: Round1Rule[];
  round2: Round2Rule[];
}

interface DraftPick {
  team: string;
  pick: number;
  note: string;
  player: Prospect | null;
}

interface Round2Pick {
  pick: number;
  team: string;
  note: string;
  forfeited: boolean;
  player: Prospect | null;
}

const COMBOS_CSV_PATH = "/mock/combos.csv";
const PROSPECTS_CSV_PATH = "/mock/prospects.csv";
const STANDINGS_JSON_PATH = "/data/standings.json";
const PICK_TRADES_JSON_PATH = "/data/pick-trades.json";
const LOTTERY_HISTORY_JSON_PATH = "/data/lottery-history.json";
const PLAYOFF_RESULTS_JSON_PATH = "/data/playoff-results.json";
const GAMES_IN_SEASON = 84;

const BALL_COLORS: [string, string][] = [
  ["#c0392b", "#e74c3c"],
  ["#d4ac0d", "#f1c40f"],
  ["#1a5276", "#2980b9"],
  ["#145a32", "#27ae60"],
  ["#6c3483", "#8e44ad"],
  ["#117a65", "#1abc9c"],
  ["#7b241c", "#e74c3c"],
  ["#784212", "#e67e22"],
  ["#1c2833", "#566573"],
  ["#0e6655", "#1abc9c"],
  ["#4a235a", "#9b59b6"],
  ["#78281f", "#cb4335"],
  ["#154360", "#5dade2"],
  ["#1e8449", "#58d68d"],
];

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function DrawnBall({ n, isNew }: { n: number; isNew: boolean }) {
  const [bg, light] = BALL_COLORS[n - 1] ?? ["#555", "#888"];

  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: "50%",
        background: `radial-gradient(circle at 35% 30%, ${light}, ${bg})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 28,
        fontWeight: 900,
        color: "#fff",
        textShadow: "0 1px 3px rgba(0,0,0,.6)",
        boxShadow: "0 8px 24px rgba(0,0,0,.45)",
        flexShrink: 0,
        animation: isNew ? "ballDrop .4s cubic-bezier(.22,.61,.36,1)" : "none",
      }}
    >
      {n}
    </div>
  );
}

function BallSlot({ idx }: { idx: number }) {
  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: "50%",
        border: "2px dashed #2d3a50",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#2d3a50",
        fontSize: 13,
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {idx + 1}
    </div>
  );
}

export default function LotteryPage() {
  const { pathname } = useLocation();
  const pickLockRef = useRef(false);

  // useEffect(() => {
  //   document.title = "NHL Mock Draft Simulator";
  // }, []);

  const [comboRows, setComboRows] = useState<LotteryComboRow[]>([]);
  const [csvStatus, setCsvStatus] = useState("Loading NHL combination table...");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [prospectStatus, setProspectStatus] = useState("Loading prospects...");
  const [standingsFile, setStandingsFile] = useState<StandingsFile | null>(null);
  const [standingsStatus, setStandingsStatus] = useState("Loading standings...");
  const [pickTrades, setPickTrades] = useState<PickTradesFile | null>(null);
  const [lotteryHistory, setLotteryHistory] = useState<LotteryHistory | null>(null);
  const [playoffResults, setPlayoffResults] = useState<PlayoffResults | null>(null);

  const [drawnBalls, setDrawnBalls] = useState<number[]>([]);
  const [currentDraw, setCurrentDraw] = useState(1);
  const [pick1Winner, setPick1Winner] = useState<string | null>(null);
  const [pick2Winner, setPick2Winner] = useState<string | null>(null);
  const [pick1AwardedSlot, setPick1AwardedSlot] = useState<number | null>(null);
  const [pick2AwardedSlot, setPick2AwardedSlot] = useState<number | null>(null);
  const [lotteryAssignments, setLotteryAssignments] = useState<LotteryAssignment[]>([]);
  const [resultLabel, setResultLabel] = useState("Ready to draw");
  const [resultTeam, setResultTeam] = useState("");
  const [lottoPhase, setLottoPhase] = useState<"lottery" | "draft">("lottery");
  const [lottoDone, setLottoDone] = useState(false);
  const [newBallIdx, setNewBallIdx] = useState<number | null>(null);

  const [draftPicks, setDraftPicks] = useState<DraftPick[]>([]);
  const [currentPickIdx, setCurrentPickIdx] = useState(0);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [takenProspects, setTakenProspects] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<ProspectPositionFilter>("all");
  const [copyLabel, setCopyLabel] = useState("Copy Results");
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupSearch, setLookupSearch] = useState("");

  const [round2Assignments, setRound2Assignments] = useState<Record<number, Prospect>>({});
  const [round2PickIdx, setRound2PickIdx] = useState(0);
  const [mockRounds, setMockRounds] = useState<1 | 2>(1);
  const [roundsSelected, setRoundsSelected] = useState(false);
  const [currentRound, setCurrentRound] = useState<1 | 2>(1);

  useEffect(() => {
    fetch(COMBOS_CSV_PATH)
      .then((res) => {
        if (!res.ok) throw new Error("CSV not found");
        return res.text();
      })
      .then((text) => {
        const parsed = parseComboCsv(text);
        setComboRows(parsed);
        setCsvStatus(`Loaded ${parsed.length} NHL lottery combinations.`);
      })
      .catch(() => {
        setCsvStatus("Could not load combos.csv. Make sure combos.csv is in /public.");
      });
  }, []);

  useEffect(() => {
    fetch(PROSPECTS_CSV_PATH)
      .then((res) => {
        if (!res.ok) throw new Error("Prospect CSV not found");
        return res.text();
      })
      .then((text) => {
        const parsed = parseProspectsCsv(text);
        setProspects(parsed);
        setProspectStatus(`Loaded ${parsed.length} prospects.`);
      })
      .catch(() => {
        setProspectStatus("Could not load prospects.csv. Make sure prospects.csv is in /public.");
      });
  }, []);

  useEffect(() => {
    fetch(STANDINGS_JSON_PATH)
      .then((res) => {
        if (!res.ok) throw new Error("standings.json not found");
        return res.json();
      })
      .then((data: StandingsFile) => {
        setStandingsFile(data);
        setStandingsStatus(
          data.provisional
            ? `Provisional order (${data.teams.length} teams) - seeded from last season, not yet live.`
            : `Standings last updated ${new Date(data.updated ?? "").toLocaleString()}.`
        );
      })
      .catch(() => {
        setStandingsStatus("Could not load standings.json. Make sure it exists at /public/data/standings.json.");
      });
  }, []);

  useEffect(() => {
    fetch(PICK_TRADES_JSON_PATH)
      .then((res) => {
        if (!res.ok) throw new Error("pick-trades.json not found");
        return res.json();
      })
      .then((data: PickTradesFile) => setPickTrades(data))
      .catch(() => console.warn("Could not load pick-trades.json"));
  }, []);

  useEffect(() => {
    fetch(LOTTERY_HISTORY_JSON_PATH)
      .then((res) => {
        if (!res.ok) throw new Error("lottery-history.json not found");
        return res.json();
      })
      .then((data: LotteryHistory) => setLotteryHistory(data))
      .catch(() => console.warn("Could not load lottery-history.json"));
  }, []);

  useEffect(() => {
    fetch(PLAYOFF_RESULTS_JSON_PATH)
      .then((res) => {
        if (!res.ok) throw new Error("playoff-results.json not found");
        return res.json();
      })
      .then((data: { results: PlayoffResults | null }) => setPlayoffResults(data.results))
      .catch(() => console.warn("Could not load playoff-results.json"));
  }, []);

  useEffect(() => {
    if (!lookupOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLookupOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [lookupOpen]);

  const seasonComplete = useMemo(
    () => (standingsFile ? isSeasonComplete(standingsFile.teams, GAMES_IN_SEASON) : false),
    [standingsFile]
  );

  const lotteryPool = useMemo(() => {
    if (!standingsFile) return { lotteryTeams: [], otherTeams: [] };
    return getLotteryPool(standingsFile.teams);
  }, [standingsFile]);

  const lotteryTeams = useMemo(
    () =>
      lotteryPool.lotteryTeams.map((team, idx) => ({
        ...team,
        pick: idx + 1,
        odds: LOTTERY_ODDS_BY_SLOT[idx] ?? 0,
        combos: LOTTERY_COMBOS_BY_SLOT[idx] ?? 0,
        effectivePick1Odds: LOTTERY_EFFECTIVE_PICK1_ODDS_BY_SLOT[idx] ?? 0,
      })),
    [lotteryPool.lotteryTeams]
  );

  // Picks 17-32: by regular-season record until this year's playoff results
  // are known, then re-ordered by how far each team advanced (conference
  // final losers picks 29-30, Cup Final loser/champion picks 31-32).
  const playoffPickOrder = useMemo(
    () => resolvePlayoffPickOrder(lotteryPool.otherTeams, playoffResults),
    [lotteryPool.otherTeams, playoffResults]
  );

  const nonLotteryTeams = useMemo(
    () =>
      playoffPickOrder.map((team, idx) => ({
        ...team,
        pick: LOTTERY_TEAM_COUNT + idx + 1,
      })),
    [playoffPickOrder]
  );

  const round1ConditionTooltips = useMemo(() => {
    const tooltips = new Map<string, string>();

    for (const rule of pickTrades?.round1 ?? []) {
      if (rule.type === "unconditional") {
        tooltips.set(rule.from, `This pick has been traded to ${rule.to}.`);
      } else if (rule.type === "multiRecipient") {
        tooltips.set(rule.from, `This pick has been traded, split between ${rule.to.join(" or ")}.`);
      } else if (rule.type === "protectedTopN") {
        tooltips.set(
          rule.team,
          `Protected top-${rule.topN}: if this pick lands outside the top ${rule.topN}, it goes to ${rule.transferTo}.`
        );
      } else {
        tooltips.set(
          rule.team,
          `If outside the top ${rule.topN}, this pick goes to ${rule.outsideTopNRecipient}. If inside the top ${rule.topN}: ${rule.insideTopNLabel}.`
        );
      }
    }

    return tooltips;
  }, [pickTrades]);

  const advanceHistory = useMemo(
    () => (lotteryHistory ? teamsWithAdvanceHistory(DRAFT_YEAR, lotteryHistory) : []),
    [lotteryHistory]
  );

  const teamsAtWinLimit = advanceHistory
    .filter((h) => lotteryHistory !== null && h.wins >= lotteryHistory.rule.maxWins)
    .map((h) => h.team);

  const sortedDrawn = useMemo(() => [...drawnBalls].sort((a, b) => a - b), [drawnBalls]);

  const aliveTeams = useMemo(() => {
    if (drawnBalls.length === 0 || drawnBalls.length >= 4 || lottoDone) {
      return new Set(lotteryTeams.map((t) => t.name));
    }

    const aliveSlots = getAliveSlots(comboRows, sortedDrawn);
    return new Set(
      [...aliveSlots]
        .map((slot) => lotteryTeams[slot - 1]?.name)
        .filter((name): name is string => Boolean(name))
    );
  }, [comboRows, drawnBalls.length, lottoDone, lotteryTeams, sortedDrawn]);

  const possibleFourthBallsByTeam = useMemo(() => {
    if (drawnBalls.length !== 3 || lottoDone) return {};

    const bySlot = getPossibleFourthBallsBySlot(comboRows, sortedDrawn);
    const byTeam: Record<string, number[]> = {};

    Object.entries(bySlot).forEach(([slotStr, balls]) => {
      const name = lotteryTeams[Number(slotStr) - 1]?.name;
      if (name) byTeam[name] = balls;
    });

    return byTeam;
  }, [comboRows, drawnBalls.length, lottoDone, lotteryTeams, sortedDrawn]);

  const comboDisplay = [0, 1, 2, 3]
    .map((i) => (sortedDrawn[i] !== undefined ? String(sortedDrawn[i]).padStart(2, "0") : "__"))
    .join(" – ");

  const isDraftDone = draftPicks.length > 0 && draftPicks.every((pick) => pick.player);
  const draftActionDisabled = isDraftDone || prospects.length === 0;
  const curPick = draftPicks[currentPickIdx];

  const safelyAssignPicks = useCallback(
    (mode: "manual" | "auto-next" | "auto-all", manualProspect?: Prospect | null) => {
      if (pickLockRef.current || draftActionDisabled) return;

      pickLockRef.current = true;

      const getSmartAutoPick = (
        picks: DraftPick[],
        takenRanks: Set<number>,
        teamName: string
      ): Prospect | undefined => {
        const teamPositions = picks
          .filter((p) => p.team === teamName && p.player)
          .map((p) => p.player!.pos);

        const available = prospects.filter((p) => !takenRanks.has(p.rank));
        if (available.length === 0) return undefined;

        const top = available[0];

        // If top prospect is 5+ ranks better than anyone else, just take them (BPA steal logic)
        if (available.length > 1 && top.rank + 5 < available[1].rank) return top;

        // Score each prospect: base is rank, add soft penalty for position overlap, add random jitter
        const scored = available.slice(0, 12).map((p) => {
          const posTokens = p.pos.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
          const overlap = posTokens.some((token) =>
            teamPositions.some((existing) =>
              existing.toUpperCase().split(/[^A-Z]+/).filter(Boolean).includes(token)
            )
          );
          const penalty = overlap ? 3 : 0;
          const jitter = Math.floor(Math.random() * 3); // 0-2 random variance
          return { prospect: p, score: p.rank + penalty + jitter };
        });

        scored.sort((a, b) => a.score - b.score);
        return scored[0]?.prospect;
      };

      setDraftPicks((prev) => {
        const updated = [...prev];
        const latestTaken = new Set<number>();

        updated.forEach((pick) => {
          if (pick.player) latestTaken.add(pick.player.rank);
        });

        const nextOpenPickIdx = updated.findIndex((pick) => !pick.player);

        if (nextOpenPickIdx === -1) {
          setCurrentPickIdx(updated.length);
          setTakenProspects(latestTaken);
          setSelectedProspect(null);
          pickLockRef.current = false;
          return updated;
        }

        if (mode === "manual") {
          if (!manualProspect || latestTaken.has(manualProspect.rank)) {
            pickLockRef.current = false;
            return updated;
          }
          updated[nextOpenPickIdx] = { ...updated[nextOpenPickIdx], player: manualProspect };
          latestTaken.add(manualProspect.rank);
        }

        if (mode === "auto-next") {
          const teamName = updated[nextOpenPickIdx].team;
          const pick = getSmartAutoPick(updated, latestTaken, teamName);
          if (!pick) { pickLockRef.current = false; return updated; }
          updated[nextOpenPickIdx] = { ...updated[nextOpenPickIdx], player: pick };
          latestTaken.add(pick.rank);
        }

        if (mode === "auto-all") {
          let idx = nextOpenPickIdx;
          while (idx < updated.length) {
            if (updated[idx].player) { idx++; continue; }
            const teamName = updated[idx].team;
            const pick = getSmartAutoPick(updated, latestTaken, teamName);
            if (!pick) break;
            updated[idx] = { ...updated[idx], player: pick };
            latestTaken.add(pick.rank);
            idx++;
          }
        }

        const nextIdx = updated.findIndex((pick) => !pick.player);
        setCurrentPickIdx(nextIdx === -1 ? updated.length : nextIdx);
        setTakenProspects(latestTaken);
        setSelectedProspect(null);
        pickLockRef.current = false;
        return updated;
      });
    },
    [draftActionDisabled, prospects]
  );

  const round2Base = useMemo((): Round2Pick[] => {
    if (!standingsFile || !pickTrades) return [];

    // Same team order as round 1 (lottery teams by standings, playoff teams
    // by advancement once known), offset by a full round of picks.
    const base = [
      ...lotteryTeams.map((team, idx) => ({
        pick: LOTTERY_TEAM_COUNT * 2 + idx + 1,
        team: team.name,
        note: "",
        forfeited: false,
        player: null as Prospect | null,
      })),
      ...playoffPickOrder.map((team, idx) => ({
        pick: LOTTERY_TEAM_COUNT * 3 + idx + 1,
        team: team.name,
        note: "",
        forfeited: false,
        player: null as Prospect | null,
      })),
    ];

    return applyRound2Overlay(base, pickTrades.round2);
  }, [standingsFile, pickTrades, lotteryTeams, playoffPickOrder]);

  const round2Picks = useMemo(
    () => round2Base.map((p) => ({ ...p, player: round2Assignments[p.pick] ?? null })),
    [round2Base, round2Assignments]
  );

  const safelyAssignRound2Picks = useCallback(
    (mode: "manual" | "auto-next" | "auto-all", manualProspect?: Prospect | null) => {
      if (pickLockRef.current) return;

      pickLockRef.current = true;

      const getSmartAutoPick = (
        r1picks: DraftPick[],
        r2picks: Round2Pick[],
        takenRanks: Set<number>,
        teamName: string
      ): Prospect | undefined => {
        const teamPositions = [
          ...r1picks.filter((p) => p.team === teamName && p.player).map((p) => p.player!.pos),
          ...r2picks.filter((p) => p.team === teamName && p.player).map((p) => p.player!.pos),
        ];

        const available = prospects.filter((p) => !takenRanks.has(p.rank));
        if (available.length === 0) return undefined;

        const top = available[0];
        if (available.length > 1 && top.rank + 5 < available[1].rank) return top;

        const scored = available.slice(0, 12).map((p) => {
          const posTokens = p.pos.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
          const overlap = posTokens.some((token) =>
            teamPositions.some((existing) =>
              existing.toUpperCase().split(/[^A-Z]+/).filter(Boolean).includes(token)
            )
          );
          const penalty = overlap ? 3 : 0;
          const jitter = Math.floor(Math.random() * 3);
          return { prospect: p, score: p.rank + penalty + jitter };
        });

        scored.sort((a, b) => a.score - b.score);
        return scored[0]?.prospect;
      };

      const updated = [...round2Picks];
      const latestTaken = new Set<number>();

      draftPicks.forEach((p) => { if (p.player) latestTaken.add(p.player.rank); });
      updated.forEach((p) => { if (p.player) latestTaken.add(p.player.rank); });

      const commitAssignments = () => {
        const assignments: Record<number, Prospect> = {};
        updated.forEach((p) => {
          if (p.player) assignments[p.pick] = p.player;
        });
        setRound2Assignments(assignments);
      };

      const nextOpenIdx = updated.findIndex((p) => !p.player && !p.forfeited);

      if (nextOpenIdx === -1) {
        setRound2PickIdx(updated.length);
        setTakenProspects(latestTaken);
        setSelectedProspect(null);
        pickLockRef.current = false;
        return;
      }

      if (mode === "manual") {
        if (!manualProspect || latestTaken.has(manualProspect.rank)) {
          pickLockRef.current = false;
          return;
        }
        updated[nextOpenIdx] = { ...updated[nextOpenIdx], player: manualProspect };
        latestTaken.add(manualProspect.rank);
      }

      if (mode === "auto-next") {
        const teamName = updated[nextOpenIdx].team;
        const pick = getSmartAutoPick(draftPicks, updated, latestTaken, teamName);
        if (!pick) { pickLockRef.current = false; return; }
        updated[nextOpenIdx] = { ...updated[nextOpenIdx], player: pick };
        latestTaken.add(pick.rank);
      }

      if (mode === "auto-all") {
        let idx = nextOpenIdx;
        while (idx < updated.length) {
          if (updated[idx].player || updated[idx].forfeited) { idx++; continue; }
          const teamName = updated[idx].team;
          const pick = getSmartAutoPick(draftPicks, updated, latestTaken, teamName);
          if (!pick) break;
          updated[idx] = { ...updated[idx], player: pick };
          latestTaken.add(pick.rank);
          idx++;
        }
      }

      const nextIdx = updated.findIndex((p) => !p.player && !p.forfeited);
      setRound2PickIdx(nextIdx === -1 ? updated.length : nextIdx);
      setTakenProspects(latestTaken);
      setSelectedProspect(null);
      commitAssignments();
      pickLockRef.current = false;
    },
    [draftPicks, prospects, round2Picks]
  );

  const currentTargetPick = useMemo(
    () => getNextOpenLotteryPick(lotteryAssignments, lotteryTeams.length),
    [lotteryAssignments, lotteryTeams.length]
  );

  const buildOrderFromLotteryAssignments = useCallback(
    (assignments: LotteryAssignment[]) => {
      const lotteryTeamNames = lotteryTeams.map((t) => t.name);
      const slots = buildLotterySlots(assignments, lotteryTeamNames);

      const round1Base: DraftPick[] = [
        ...lotteryTeams.map((team) => ({
          team: slots[team.pick] ?? team.name,
          pick: team.pick,
          note: "",
          player: null,
        })),
        ...nonLotteryTeams.map((team) => ({ team: team.name, pick: team.pick, note: "", player: null })),
      ];

      const withOverlay = pickTrades ? applyRound1Overlay(round1Base, pickTrades.round1) : round1Base;

      return [...withOverlay].sort((a, b) => a.pick - b.pick);
    },
    [lotteryTeams, nonLotteryTeams, pickTrades]
  );

  // The current round-1 order with trades applied, reactive to the lottery
  // draw as it happens (starts from the plain projected order with
  // assignments=[] before any balls are drawn). Used so the standings table
  // shows the same trade-arrow treatment as the Full Order page, instead of
  // the raw pre-trade team name.
  const liveRound1Order = useMemo(
    () => buildOrderFromLotteryAssignments(lotteryAssignments),
    [buildOrderFromLotteryAssignments, lotteryAssignments]
  );

  const round1ByPick = useMemo(() => {
    const map = new Map<number, DraftPick>();
    liveRound1Order.forEach((pick) => map.set(pick.pick, pick));
    return map;
  }, [liveRound1Order]);

  const finalizeLottery = useCallback(
    (assignments: LotteryAssignment[]) => {
      const order = buildOrderFromLotteryAssignments(assignments);

      pickLockRef.current = false;
      setDraftPicks(order);
      setCurrentPickIdx(0);
      setTakenProspects(new Set());
      setSelectedProspect(null);
      setLottoDone(true);
    },
    [buildOrderFromLotteryAssignments]
  );

  const evaluateCombo = useCallback(
    (balls: number[], draw: number, p1w: string | null, assignmentsBeforeDraw: LotteryAssignment[]) => {
      const resolved = resolveCombo(comboRows, balls);

      if (!resolved || resolved === "redraw") {
        setResultLabel("REDRAW - Invalid combo [11-12-13-14]");
        setResultTeam("");

        setTimeout(() => {
          setDrawnBalls([]);
          setNewBallIdx(null);
          setResultLabel(draw === 1 ? "Draw 1 ready" : `Draw ${draw} ready`);
        }, 1800);

        return;
      }

      const winner = lotteryTeams[resolved.slot - 1]?.name;
      if (!winner) return;

      const alreadyAssigned = assignmentsBeforeDraw.some((assignment) => assignment.team === winner);

      if (alreadyAssigned || winner === p1w) {
        setResultLabel("REDRAW - Team already assigned a pick");
        setResultTeam(winner);

        setTimeout(() => {
          setDrawnBalls([]);
          setNewBallIdx(null);
          setResultLabel(`Draw ${draw} ready`);
          setResultTeam("");
        }, 1800);

        return;
      }

      const targetPick = getNextOpenLotteryPick(assignmentsBeforeDraw, lotteryTeams.length);
      const highestAllowedPick = getHighestAllowedPick(resolved.slot, MAX_MOVE_UP, lotteryTeams.length);
      const occupiedPicks = getOccupiedPicks(assignmentsBeforeDraw);
      const speculativeAwardedPick = getAwardedPick(targetPick, highestAllowedPick, occupiedPicks, lotteryTeams.length);
      const wouldImprove = didLotteryMoveImprovePick(resolved.slot, speculativeAwardedPick);

      if (wouldImprove && lotteryHistory && !isEligibleToAdvance(winner, DRAFT_YEAR, lotteryHistory)) {
        setResultLabel(`REDRAW - ${winner} ineligible (lottery win limit)`);
        setResultTeam(winner);

        setTimeout(() => {
          setDrawnBalls([]);
          setNewBallIdx(null);
          setResultLabel(`Draw ${draw} ready`);
          setResultTeam("");
        }, 1800);

        return;
      }

      const lotteryTeamNames = lotteryTeams.map((t) => t.name);
      const { assignments, awardedPick, defaultLockedTeam } = applyLotteryDrawAssignment(
        assignmentsBeforeDraw,
        winner,
        targetPick,
        highestAllowedPick,
        lotteryTeamNames
      );

      if (draw === 1) {
        setPick1Winner(winner);
        setPick1AwardedSlot(awardedPick);
        setLotteryAssignments(assignments);
        setResultLabel(awardedPick === targetPick ? `Pick ${targetPick} awarded to` : `Lottery win - moves up to Pick ${awardedPick}`);
        setResultTeam(
          defaultLockedTeam
            ? `${winner} · ${defaultLockedTeam} locks Pick ${targetPick}`
            : winner
        );

        setTimeout(() => {
          const nextPick = getNextOpenLotteryPick(assignments, lotteryTeams.length);
          setCurrentDraw(2);
          setDrawnBalls([]);
          setNewBallIdx(null);
          setResultLabel(`Draw 2 ready - Pick ${nextPick}`);
          setResultTeam("");
        }, 1400);

        return;
      }

      setPick2Winner(winner);
      setPick2AwardedSlot(awardedPick);
      setLotteryAssignments(assignments);
      setResultLabel(awardedPick === targetPick ? `Pick ${targetPick} awarded to` : `Lottery win - moves up to Pick ${awardedPick}`);
      setResultTeam(
        defaultLockedTeam
          ? `${winner} · ${defaultLockedTeam} locks Pick ${targetPick}`
          : winner
      );

      finalizeLottery(assignments);
    },
    [comboRows, finalizeLottery, lotteryHistory, lotteryTeams]
  );

  const drawOneBall = useCallback(() => {
    if (drawnBalls.length >= 4 || lottoDone || comboRows.length === 0 || lotteryTeams.length === 0) return;

    const remaining = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].filter(
      (b) => !drawnBalls.includes(b)
    );
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    const newBalls = [...drawnBalls, pick];

    setDrawnBalls(newBalls);
    setNewBallIdx(newBalls.length - 1);

    if (newBalls.length === 4) {
      evaluateCombo(newBalls, currentDraw, pick1Winner, lotteryAssignments);
    }
  }, [comboRows.length, currentDraw, drawnBalls, evaluateCombo, lottoDone, lotteryAssignments, lotteryTeams.length, pick1Winner]);

  const simDraw = useCallback(() => {
    if (lottoDone || comboRows.length === 0 || lotteryTeams.length === 0) return;

    const balls = [...drawnBalls];

    while (balls.length < 4) {
      const remaining = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].filter(
        (b) => !balls.includes(b)
      );
      balls.push(remaining[Math.floor(Math.random() * remaining.length)]);
    }

    setDrawnBalls(balls);
    setNewBallIdx(null);
    evaluateCombo(balls, currentDraw, pick1Winner, lotteryAssignments);
  }, [comboRows.length, currentDraw, drawnBalls, evaluateCombo, lottoDone, lotteryAssignments, lotteryTeams.length, pick1Winner]);

  const resetLottery = useCallback(() => {
    pickLockRef.current = false;
    setDrawnBalls([]);
    setCurrentDraw(1);
    setPick1Winner(null);
    setPick2Winner(null);
    setPick1AwardedSlot(null);
    setPick2AwardedSlot(null);
    setLotteryAssignments([]);
    setResultLabel("Ready to draw");
    setResultTeam("");
    setLottoDone(false);
    setLottoPhase("lottery");
    setDraftPicks([]);
    setCurrentPickIdx(0);
    setSelectedProspect(null);
    setTakenProspects(new Set());
    setSearch("");
    setPositionFilter("all");
    setNewBallIdx(null);
    setCopyLabel("Copy Results");
    setRound2Assignments({});
    setRound2PickIdx(0);
    setCurrentRound(1);
    setRoundsSelected(false);
  }, []);

  const makePick = useCallback(() => {
    safelyAssignPicks("manual", selectedProspect);
  }, [safelyAssignPicks, selectedProspect]);

  const autoPick = useCallback(() => {
    safelyAssignPicks("auto-next");
  }, [safelyAssignPicks]);

  const autoPickAll = useCallback(() => {
    safelyAssignPicks("auto-all");
  }, [safelyAssignPicks]);

  const copyResults = useCallback(() => {
    const r1lines = draftPicks.map((p) => `${p.pick}. ${p.team}${p.note ? " " + p.note : ""}: ${p.player ? `${p.player.name} (${formatProspectMeta(p.player)})` : "-"}`).join("\n");
    const r2lines = round2Picks.length > 0
      ? "\n\nRound 2\n\n" + round2Picks.map((p) => p.forfeited ? `${p.pick}. FORFEITED (${p.note})` : `${p.pick}. ${p.team}${p.note ? " " + p.note : ""}: ${p.player ? `${p.player.name} (${formatProspectMeta(p.player)})` : "-"}`).join("\n")
      : "";

    navigator.clipboard.writeText(`${DRAFT_YEAR} NHL Mock Draft - Round 1\n\n${r1lines}${r2lines}`).then(() => {
      setCopyLabel("Copied!");
      setTimeout(() => setCopyLabel("Copy Results"), 2000);
    });
  }, [draftPicks, round2Picks]);

  const saveDraft = useCallback(() => {
    const origin = window.location.origin;
    const logoTag = (teamName: string) => {
      const abbrev = abbrevForTeamName(teamName.replace(/\s*\(.*\)\s*$/, ""));
      return abbrev
        ? `<img class="logo" src="${origin}/logos/${abbrev}.svg" alt="" />`
        : `<span class="logo-chip"></span>`;
    };

    const renderRow = (pickNum: number, team: string, note: string, player: Prospect | null, forfeited?: boolean) => {
      if (forfeited) {
        return `
          <div class="pick-row">
            <div class="pick-number">${escapeHtml(pickNum)}</div>
            <span class="logo-chip"></span>
            <div class="team-name muted">Forfeited</div>
            <div class="player-name muted">${escapeHtml(note)}</div>
          </div>
        `;
      }

      const playerLabel = player ? `${player.name} (${formatProspectMeta(player)})` : "-";

      return `
        <div class="pick-row">
          <div class="pick-number">${escapeHtml(pickNum)}</div>
          ${logoTag(team)}
          <div class="team-name">
            ${escapeHtml(team)}
            ${note ? `<div class="pick-note">${escapeHtml(note)}</div>` : ""}
          </div>
          <div class="player-name">${escapeHtml(playerLabel)}</div>
        </div>
      `;
    };

    const round1Rows = draftPicks.map((p) => renderRow(p.pick, p.team, p.note, p.player)).join("");
    const round2Rows = round2Picks
      .map((p) => renderRow(p.pick, p.team, p.note, p.player, p.forfeited))
      .join("");

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${DRAFT_YEAR} NHL Mock Draft</title>
  <style>
    * { box-sizing: border-box; }

    @page { size: letter portrait; margin: 0.3in; }

    html, body {
      margin: 0;
      background: #fff;
      color: #333;
      font-family: "Source Sans 3", "Segoe UI", Arial, sans-serif;
    }

    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 400;
      text-align: center;
    }

    .rule-frame {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 4px 0 14px;
    }

    .rule-frame::before,
    .rule-frame::after {
      content: "";
      flex: 1;
      height: 1px;
      background: #7b5ea7;
    }

    .subtitle {
      text-align: center;
      color: #6b6b75;
      font-size: 11px;
      margin-bottom: 14px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .pick-list {
      break-inside: avoid;
    }

    .pick-row {
      display: grid;
      grid-template-columns: 26px 22px 1fr 1.3fr;
      gap: 8px;
      align-items: center;
      padding: 5px 4px;
      border-bottom: 1px solid #e3e3e8;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .pick-number {
      font-weight: 800;
      color: #7b5ea7;
      text-align: center;
      font-size: 13px;
    }

    .logo,
    .logo-chip {
      width: 20px;
      height: 20px;
    }

    .logo-chip {
      background: #6b6b75;
      border-radius: 50%;
      display: inline-block;
    }

    .team-name {
      font-weight: 700;
      font-size: 11px;
      line-height: 1.2;
    }

    .team-name.muted {
      color: #6b6b75;
    }

    .pick-note {
      font-weight: 400;
      color: #6b6b75;
      font-size: 8.5px;
    }

    .player-name {
      font-size: 10.5px;
      color: #333;
    }

    .player-name.muted {
      color: #6b6b75;
      font-style: italic;
    }

    .round-page {
      break-before: page;
    }

    .round-page:first-of-type {
      break-before: auto;
    }

    .print-actions {
      text-align: center;
      margin-top: 16px;
    }

    .print-actions button {
      background: #7b5ea7;
      color: #fff;
      border: none;
      border-bottom: 3px solid #5b3f8c;
      border-radius: 4px;
      padding: 10px 18px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      cursor: pointer;
    }

    @media print {
      .print-actions { display: none; }
    }
  </style>
</head>
<body>
  <div class="round-page">
    <div class="rule-frame"><h1>${DRAFT_YEAR} NHL Mock Draft</h1></div>
    <div class="subtitle">Round 1 &middot; Picks 1-32</div>
    <div class="pick-list">${round1Rows}</div>
  </div>

  ${
    mockRounds === 2 && round2Picks.length > 0
      ? `
    <div class="round-page">
      <div class="rule-frame"><h1>${DRAFT_YEAR} NHL Mock Draft</h1></div>
      <div class="subtitle">Round 2 &middot; Picks 33-64</div>
      <div class="pick-list">${round2Rows}</div>
    </div>
  `
      : ""
  }

  <div class="print-actions">
    <button onclick="window.print()">Print / Save PDF</button>
  </div>
</body>
</html>`;

    const draftWindow = window.open("", "_blank");

    if (draftWindow) {
      draftWindow.document.open();
      draftWindow.document.write(html);
      draftWindow.document.close();
      draftWindow.focus();
      return;
    }

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${DRAFT_YEAR}-nhl-mock-draft.html`;
    link.click();

    URL.revokeObjectURL(url);
  }, [draftPicks, mockRounds, round2Picks]);

  const filteredProspects = prospects.filter((p) => {
    const searchLower = search.toLowerCase();

    const matchesSearch =
      p.name.toLowerCase().includes(searchLower) ||
      p.pos.toLowerCase().includes(searchLower) ||
      p.league.toLowerCase().includes(searchLower) ||
      (p.team ?? "").toLowerCase().includes(searchLower);

    return !takenProspects.has(p.rank) && matchesSearch && prospectMatchesPositionFilter(p, positionFilter);
  });

  const comboRowTeamName = useCallback(
    (row: LotteryComboRow) => {
      if (!Number.isFinite(row.slot)) return "Redraw";
      return lotteryTeams[row.slot - 1]?.name ?? `Slot ${row.slot}`;
    },
    [lotteryTeams]
  );

  const filteredComboRows = useMemo(() => {
    const searchLower = lookupSearch.trim().toLowerCase();

    if (!searchLower) return comboRows;

    return comboRows.filter((row) => {
      const ballDashText = row.balls.join("-");
      const ballCommaText = row.balls.join(",");
      const ballSpaceText = row.balls.join(" ");
      const sequenceText = row.slotSequence === null ? "" : String(row.slotSequence);
      const teamName = comboRowTeamName(row);

      return (
        String(row.id).includes(searchLower) ||
        teamName.toLowerCase().includes(searchLower) ||
        String(row.slot).includes(searchLower) ||
        sequenceText.includes(searchLower) ||
        ballDashText.includes(searchLower) ||
        ballCommaText.includes(searchLower) ||
        ballSpaceText.includes(searchLower)
      );
    });
  }, [comboRows, comboRowTeamName, lookupSearch]);

  const formatRecord = (t: TeamStanding) => `${t.wins}-${t.losses}-${t.otLosses}`;
  const formatL10 = (t: TeamStanding) => `${t.l10Wins}-${t.l10Losses}-${t.l10OtLosses}`;
  const formatStreak = (t: TeamStanding) => (t.gamesPlayed === 0 ? "--" : `${t.streakCode}${t.streakCount}`);
  const formatPct = (t: TeamStanding) => (t.gamesPlayed === 0 ? "--" : t.pointPctg.toFixed(3).replace(/^0/, ""));

  const statHeaderRow = (
    <tr>
      <th style={{ width: 50 }}>Pick</th>
      <th>Team</th>
      <th>Record</th>
      <th>Pts</th>
      <th className="tint-col">PT%</th>
      <th>RW</th>
      <th className="tint-col">ROW</th>
      <th>Strk</th>
      <th>L10</th>
      <th>Odds</th>
      <th>#1 Ovr</th>
    </tr>
  );

  function PickTeamCell({ team }: { team: { name: string; pick: number } }) {
    const overlayPick = round1ByPick.get(team.pick);
    const displayTeam = overlayPick?.team ?? team.name;
    const displayNote = overlayPick?.note ?? "";
    // Only show the "*" heads-up when the condition exists but hasn't
    // actually transferred the pick yet - once it has, the arrow itself
    // already shows the recipient, so the asterisk would be redundant.
    const pendingTooltip = displayTeam === team.name ? round1ConditionTooltips.get(team.name) : undefined;

    if (pendingTooltip) {
      return (
        <Tooltip text={pendingTooltip}>
          <span className="team-cell">
            <TradedPickTeam team={displayTeam} note={displayNote} />
            <span className="condition-asterisk">*</span>
          </span>
        </Tooltip>
      );
    }

    return <TradedPickTeam team={displayTeam} note={displayNote} />;
  }

  function LotteryTeamRow({ team, idx }: { team: (typeof lotteryTeams)[number]; idx: number }) {
    const isP1 = pick1Winner === team.name;
    const isP2 = pick2Winner === team.name;
    const won = isP1 || isP2;
    const ballsDrawn = drawnBalls.length;
    const isAlive = ballsDrawn > 0 && ballsDrawn < 4 && aliveTeams.has(team.name);
    const isEliminated = ballsDrawn > 0 && ballsDrawn < 4 && !aliveTeams.has(team.name) && !lottoDone;
    const fourthBalls = possibleFourthBallsByTeam[team.name] ?? [];
    const assignedLotteryPick = lottoDone
      ? Number(
          Object.entries(buildLotterySlots(lotteryAssignments, lotteryTeams.map((t) => t.name))).find(
            ([, slotTeam]) => slotTeam === team.name
          )?.[0] ?? idx + 1
        )
      : idx + 1;

    return (
      <tr key={team.abbrev} className={isAlive ? "lottery-row-alive" : isEliminated ? "lottery-row-eliminated" : ""}>
        <td>{idx + 1}</td>
        <td>
          <span className="team-cell lottery-team-cell">
            <PickTeamCell team={team} />
            {isAlive && !lottoDone && <span className="pill pill-alive">Alive</span>}
            {isEliminated && <span className="pill pill-out">Out</span>}
            {won && lottoDone && (
              <span className="pill pill-won">Pick {isP1 ? pick1AwardedSlot ?? 1 : pick2AwardedSlot ?? 2}</span>
            )}
            {!won && lottoDone && <span className="pill">{assignedLotteryPick}</span>}
            {fourthBalls.length > 0 && (
              <span className="fourth-ball-row">
                {fourthBalls.map((ball) => (
                  <span key={ball} className="fourth-ball-chip">
                    Ball {ball}
                  </span>
                ))}
              </span>
            )}
          </span>
        </td>
        <td>{formatRecord(team)}</td>
        <td>{team.points}</td>
        <td className="tint-col">{formatPct(team)}</td>
        <td>{team.regulationWins}</td>
        <td className="tint-col">{team.row}</td>
        <td>{formatStreak(team)}</td>
        <td>{formatL10(team)}</td>
        <td>{team.odds}%</td>
        <td>{team.effectivePick1Odds}%</td>
      </tr>
    );
  }

  function NonLotteryTeamRow({ team }: { team: (typeof nonLotteryTeams)[number] }) {
    return (
      <tr key={team.abbrev}>
        <td>{team.pick}</td>
        <td>
          <span className="team-cell">
            <PickTeamCell team={team} />
          </span>
        </td>
        <td>{formatRecord(team)}</td>
        <td>{team.points}</td>
        <td className="tint-col">{formatPct(team)}</td>
        <td>{team.regulationWins}</td>
        <td className="tint-col">{team.row}</td>
        <td>{formatStreak(team)}</td>
        <td>{formatL10(team)}</td>
        <td>--</td>
        <td>--</td>
      </tr>
    );
  }

  // On the active draft board (round 1/2), the draft-toolbar's own heading
  // already identifies the page - repeating the big framed title + subtitle
  // + status line above it just pushes the board and prospect panel down
  // the page for no benefit, forcing a scroll before you can even draft.
  const showFullHeader = !(lottoPhase === "draft" && roundsSelected);
  const cameForMockDraft = pathname === "/draft" && lottoPhase === "lottery";

  return (
    <div className="container">
      {showFullHeader && (
        <>
          <div className="page-title-frame">
            <h1 className="page-title">
              {lottoPhase === "draft" || cameForMockDraft
                ? `${DRAFT_YEAR} Mock Draft`
                : `${DRAFT_YEAR} Draft Lottery Simulator`}
            </h1>
          </div>

          <p className="lottery-page-sub">
            {lottoPhase === "draft"
              ? `Build your ${DRAFT_YEAR} NHL first-round mock draft.`
              : cameForMockDraft
                ? `The mock draft starts from the lottery result, so the lottery comes first.`
                : `Sim the ${DRAFT_YEAR} NHL Draft Lottery, then run your own mock draft!`}
          </p>
          <p className="status-line">
            {standingsFile?.provisional
              ? `Projected order, seeded from last season's final standings. ${SEASON_LABEL} season not yet underway.`
              : seasonComplete
                ? `Final order. ${SEASON_LABEL} regular season complete.${standingsFile?.updated ? ` Standings last updated ${new Date(standingsFile.updated).toLocaleString()}.` : ""}`
                : `Projected order. ${SEASON_LABEL} season in progress.${standingsFile?.updated ? ` Standings last updated ${new Date(standingsFile.updated).toLocaleString()}.` : ""}`}
            {" "}
            {csvStatus} {prospectStatus} {standingsFile ? "" : standingsStatus}
          </p>
        </>
      )}

      {lottoPhase === "lottery" && (
        <>
          {cameForMockDraft && (
            <div className="draft-prereq-note">
              <strong>Step 1: set the draft order.</strong>{" "}
              {lottoDone
                ? "The lottery is done. Hit Start Mock Draft below to begin picking."
                : "Hit Sim Lottery to run it instantly, or Draw Ball to draw it yourself. Start Mock Draft appears once both drawings are done."}
            </div>
          )}

          <div className="lottery-machine">
            <div className="lottery-machine-title">Lottery Draw</div>
            <div className="lottery-machine-phase">
              Drawing {currentDraw} of 2 &middot; Pick {currentTargetPick}
            </div>

            <div className="ball-display">
              {[0, 1, 2, 3].map((idx) =>
                drawnBalls[idx] !== undefined ? (
                  <DrawnBall key={idx} n={drawnBalls[idx]} isNew={newBallIdx === idx} />
                ) : (
                  <BallSlot key={idx} idx={idx} />
                )
              )}
            </div>

            <div className="combo-box">
              <div className="combo-label">Current combination</div>
              <div className="combo-numbers">{comboDisplay}</div>
            </div>

            <div className="result-banner">
              <div className="result-pick-label">{resultLabel}</div>
              {resultTeam && <div className="result-team-name">{resultTeam}</div>}
            </div>

            <div className="btn-row">
              <button
                className="btn"
                onClick={drawOneBall}
                disabled={drawnBalls.length >= 4 || lottoDone || comboRows.length === 0 || lotteryTeams.length === 0}
              >
                Draw Ball
              </button>
              <button
                className="btn btn-outline"
                onClick={simDraw}
                disabled={drawnBalls.length >= 4 || lottoDone || comboRows.length === 0 || lotteryTeams.length === 0}
              >
                Sim Lottery
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setLookupOpen(true)}
                disabled={comboRows.length === 0 || lotteryTeams.length === 0}
              >
                Combo Lookup
              </button>
            </div>

            <div className="btn-row">
              <button className="btn btn-danger" onClick={resetLottery}>
                Reset
              </button>
              {lottoDone && (
                <button className="btn" onClick={() => setLottoPhase("draft")} disabled={prospects.length === 0}>
                  Start Mock Draft
                </button>
              )}
            </div>

            <div className="machine-help-text">
              {drawnBalls.length === 3 && !lottoDone
                ? "After three balls, alive teams show which fourth ball would complete their combination."
                : "Draw manually or sim the remaining balls."}
            </div>
          </div>

          <div className="stat-table-scroll">
            <table className="stat-table">
              <thead>{statHeaderRow}</thead>
              <tbody>
                {lotteryTeams.map((team, idx) => (
                  <LotteryTeamRow key={team.abbrev} team={team} idx={idx} />
                ))}
                <tr className="end-of-lottery-row">
                  <td colSpan={11}>End of Lottery</td>
                </tr>
                {nonLotteryTeams.map((team) => (
                  <NonLotteryTeamRow key={team.abbrev} team={team} />
                ))}
              </tbody>
            </table>
          </div>

          {advanceHistory.length > 0 && (
            <div className="advance-history-note">
              Under NHL rules, a team can move up in the draft order by winning a lottery drawing at most twice in
              any five-year span. Wins that count toward this year's lottery ({DRAFT_YEAR - 4}-{DRAFT_YEAR - 1}):{" "}
              {advanceHistory.map((h) => `${h.team} (${h.wins})`).join(", ")}. A team with one win can still move up
              this year.{" "}
              {teamsAtWinLimit.length > 0
                ? `${teamsAtWinLimit.join(", ")} already ${teamsAtWinLimit.length === 1 ? "has" : "have"} two, so a drawing won by ${teamsAtWinLimit.length === 1 ? "that team" : "one of those teams"} is redrawn.`
                : "No team has two yet, so every lottery team is eligible."}
            </div>
          )}
        </>
      )}

      {lottoPhase === "draft" && !roundsSelected && (
        <div className="round-select-card">
          <h2>How many rounds?</h2>
          <div className="btn-row">
            <button
              className="btn"
              onClick={() => {
                setMockRounds(1);
                setRoundsSelected(true);
                setCurrentRound(1);
              }}
            >
              1 Round
            </button>
            <button
              className="btn btn-outline"
              onClick={() => {
                setMockRounds(2);
                setRoundsSelected(true);
                setCurrentRound(1);
              }}
            >
              2 Rounds
            </button>
          </div>
        </div>
      )}

      {lottoPhase === "draft" && roundsSelected && currentRound === 1 && (
        <div>
          <div className="draft-toolbar">
            <h2 className="page-title" style={{ fontSize: "1.6rem" }}>
              {DRAFT_YEAR} Mock Draft - Round 1
            </h2>
            <div className="btn-row">
              <button className="btn btn-outline" onClick={() => setLottoPhase("lottery")}>
                Back to Lottery
              </button>
              <button className="btn" onClick={autoPickAll} disabled={draftActionDisabled}>
                Auto-Pick All
              </button>
              <button className="btn btn-outline" onClick={copyResults}>
                {copyLabel}
              </button>
              <button className="btn btn-outline" onClick={saveDraft} disabled={draftPicks.length === 0}>
                Save Draft
              </button>
              {isDraftDone && mockRounds === 2 && (
                <button className="btn" onClick={() => setCurrentRound(2)}>
                  Continue to Round 2
                </button>
              )}
              {isDraftDone && mockRounds === 1 && (
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setMockRounds(2);
                    setCurrentRound(2);
                  }}
                >
                  Add Round 2
                </button>
              )}
              <button className="btn btn-danger" onClick={resetLottery}>
                New Simulation
              </button>
            </div>
          </div>

          <div className="draft-layout">
            <div className="draft-board">
              {draftPicks.map((pick, idx) => {
                const onClock = idx === currentPickIdx && !isDraftDone;
                return (
                  <div key={`${pick.pick}-${pick.team}`} className={`pick-row${onClock ? " on-clock" : ""}`}>
                    <div className="pick-number">{pick.pick}</div>
                    <div>
                      {onClock && <div className="on-clock-label">On the clock</div>}
                      <TradedPickTeam team={pick.team} note={pick.note} />
                      {pick.player ? (
                        <div className="pick-player">
                          {pick.player.name}
                          {formatProspectMeta(pick.player) ? ` (${formatProspectMeta(pick.player)})` : ""}
                        </div>
                      ) : (
                        <div className="pick-player" style={{ fontStyle: "italic" }}>
                          -
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              {!isDraftDone ? (
                <div className="prospect-panel">
                  <div className="prospect-panel-title">Available Prospects</div>
                  <div className="on-clock-card">
                    <div className="result-pick-label">Pick #{curPick?.pick}</div>
                    <div className="team-name">{curPick?.team}</div>
                  </div>
                  <button
                    className="btn"
                    onClick={makePick}
                    disabled={!selectedProspect || draftActionDisabled}
                    style={{ width: "100%" }}
                  >
                    {selectedProspect && !draftActionDisabled ? `Draft ${selectedProspect.name}` : "Select a Prospect"}
                  </button>
                  <button className="btn btn-outline" onClick={autoPick} disabled={draftActionDisabled}>
                    Auto-Pick Next
                  </button>
                  <input
                    className="form-input"
                    placeholder="Search prospects"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setSelectedProspect(null);
                    }}
                    disabled={draftActionDisabled}
                  />
                  <select
                    className="form-input"
                    value={positionFilter}
                    onChange={(e) => {
                      setPositionFilter(e.target.value as ProspectPositionFilter);
                      setSelectedProspect(null);
                    }}
                    disabled={draftActionDisabled}
                  >
                    <option value="all">All Positions</option>
                    <option value="centers">Centers</option>
                    <option value="wingers">Wingers</option>
                    <option value="forwards">Forwards</option>
                    <option value="defense">Defense</option>
                    <option value="goalies">Goalies</option>
                  </select>
                  <div className="prospect-list">
                    {filteredProspects.map((prospect) => (
                      <div
                        key={prospect.rank}
                        className={`prospect-row${selectedProspect?.rank === prospect.rank ? " selected" : ""}`}
                        onClick={() => {
                          if (!draftActionDisabled && !takenProspects.has(prospect.rank)) setSelectedProspect(prospect);
                        }}
                      >
                        <span className="prospect-rank">#{prospect.rank}</span>
                        <strong>{prospect.name}</strong>
                        <div className="prospect-meta">{formatProspectMeta(prospect)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="complete-card">
                  <h2>Round 1 Complete</h2>
                  <p style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-5)" }}>
                    All 32 picks have been made.
                  </p>
                  <div className="btn-row">
                    <button className="btn btn-outline" onClick={copyResults}>
                      {copyLabel}
                    </button>
                    <button className="btn btn-outline" onClick={saveDraft}>
                      Save Draft
                    </button>
                    {mockRounds === 2 && (
                      <button className="btn" onClick={() => setCurrentRound(2)}>
                        Continue to Round 2
                      </button>
                    )}
                    {mockRounds === 1 && (
                      <button
                        className="btn btn-outline"
                        onClick={() => {
                          setMockRounds(2);
                          setCurrentRound(2);
                        }}
                      >
                        Add Round 2
                      </button>
                    )}
                    <button className="btn btn-danger" onClick={resetLottery}>
                      New Simulation
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {lottoPhase === "draft" && roundsSelected && currentRound === 2 && (
        <div>
          <div className="draft-toolbar">
            <h2 className="page-title" style={{ fontSize: "1.6rem" }}>
              {DRAFT_YEAR} Mock Draft - Round 2
            </h2>
            <div className="btn-row">
              <button className="btn btn-outline" onClick={() => setCurrentRound(1)}>
                Back to Round 1
              </button>
              <button
                className="btn"
                onClick={() => safelyAssignRound2Picks("auto-all")}
                disabled={round2Picks.every((p) => p.player || p.forfeited)}
              >
                Auto-Pick All
              </button>
              <button className="btn btn-outline" onClick={copyResults}>
                {copyLabel}
              </button>
              <button className="btn btn-outline" onClick={saveDraft}>
                Save Draft
              </button>
              <button className="btn btn-danger" onClick={resetLottery}>
                New Simulation
              </button>
            </div>
          </div>

          <div className="draft-layout">
            <div className="draft-board">
              {round2Picks.map((pick, idx) => {
                const onClock = idx === round2PickIdx && !pick.forfeited && !round2Picks.every((p) => p.player || p.forfeited);
                return (
                  <div
                    key={`r2-${pick.pick}`}
                    className={`pick-row${pick.forfeited ? " forfeited" : ""}${onClock ? " on-clock" : ""}`}
                  >
                    <div className="pick-number">{pick.pick}</div>
                    <div>
                      {onClock && <div className="on-clock-label">On the clock</div>}
                      {pick.forfeited ? (
                        <>
                          <div>Forfeited</div>
                          <div className="pick-note">{pick.note}</div>
                        </>
                      ) : (
                        <>
                          <TradedPickTeam team={pick.team} note={pick.note} />
                          {pick.player ? (
                            <div className="pick-player">
                              {pick.player.name}
                              {formatProspectMeta(pick.player) ? ` (${formatProspectMeta(pick.player)})` : ""}
                            </div>
                          ) : (
                            <div className="pick-player" style={{ fontStyle: "italic" }}>
                              -
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              {!round2Picks.every((p) => p.player || p.forfeited) ? (
                <div className="prospect-panel">
                  <div className="prospect-panel-title">Available Prospects</div>
                  {(() => {
                    const curR2Pick = round2Picks[round2PickIdx];
                    return (
                      <>
                        <div className="on-clock-card">
                          <div className="result-pick-label">Pick #{curR2Pick?.pick}</div>
                          <div className="team-name">{curR2Pick?.team}</div>
                        </div>
                        <button
                          className="btn"
                          style={{ width: "100%" }}
                          onClick={() => safelyAssignRound2Picks("manual", selectedProspect)}
                          disabled={!selectedProspect}
                        >
                          {selectedProspect ? `Draft ${selectedProspect.name}` : "Select a Prospect"}
                        </button>
                        <button className="btn btn-outline" onClick={() => safelyAssignRound2Picks("auto-next")}>
                          Auto-Pick Next
                        </button>
                        <input
                          className="form-input"
                          placeholder="Search prospects"
                          value={search}
                          onChange={(e) => {
                            setSearch(e.target.value);
                            setSelectedProspect(null);
                          }}
                        />
                        <select
                          className="form-input"
                          value={positionFilter}
                          onChange={(e) => {
                            setPositionFilter(e.target.value as ProspectPositionFilter);
                            setSelectedProspect(null);
                          }}
                        >
                          <option value="all">All Positions</option>
                          <option value="centers">Centers</option>
                          <option value="wingers">Wingers</option>
                          <option value="forwards">Forwards</option>
                          <option value="defense">Defense</option>
                          <option value="goalies">Goalies</option>
                        </select>
                        <div className="prospect-list">
                          {filteredProspects.map((prospect) => (
                            <div
                              key={prospect.rank}
                              className={`prospect-row${selectedProspect?.rank === prospect.rank ? " selected" : ""}`}
                              onClick={() => {
                                if (!takenProspects.has(prospect.rank)) setSelectedProspect(prospect);
                              }}
                            >
                              <span className="prospect-rank">#{prospect.rank}</span>
                              <strong>{prospect.name}</strong>
                              <div className="prospect-meta">{formatProspectMeta(prospect)}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="complete-card">
                  <h2>Draft Complete</h2>
                  <p style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-5)" }}>
                    All picks have been made.
                  </p>
                  <div className="btn-row">
                    <button className="btn btn-outline" onClick={copyResults}>
                      {copyLabel}
                    </button>
                    <button className="btn btn-outline" onClick={saveDraft}>
                      Save Draft
                    </button>
                    <button className="btn btn-danger" onClick={resetLottery}>
                      New Simulation
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {lookupOpen && (
        <div className="modal-overlay" onClick={() => setLookupOpen(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Lottery Combination Lookup</div>
                <div className="modal-subtitle">Search by team, slot, combination ID, sequence number, or balls.</div>
              </div>
              <button className="btn btn-danger" onClick={() => setLookupOpen(false)}>
                Close
              </button>
            </div>

            <div className="modal-search">
              <input
                className="form-input"
                placeholder="Search combos, teams, balls, or IDs"
                value={lookupSearch}
                onChange={(event) => setLookupSearch(event.target.value)}
                autoFocus
              />
              <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)", whiteSpace: "nowrap" }}>
                {filteredComboRows.length} / {comboRows.length} combos
              </div>
            </div>

            <div className="modal-body">
              <table className="stat-table">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>ID</th>
                    <th style={{ width: 160 }}>Balls</th>
                    <th>Team</th>
                    <th style={{ width: 80 }}>Slot</th>
                    <th style={{ width: 100 }}>Sequence</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredComboRows.map((row) => {
                    const isRedraw = !Number.isFinite(row.slot);
                    return (
                      <tr key={`${row.id}-${row.balls.join("-")}`}>
                        <td>{row.id}</td>
                        <td style={{ fontWeight: 700, color: "var(--color-purple)" }}>
                          {row.balls.map((ball) => String(ball).padStart(2, "0")).join(" - ")}
                        </td>
                        <td style={{ color: isRedraw ? "#a94442" : "var(--color-text)", fontWeight: 700 }}>
                          {comboRowTeamName(row)}
                        </td>
                        <td>{isRedraw ? "--" : row.slot}</td>
                        <td>{row.slotSequence ?? "--"}</td>
                      </tr>
                    );
                  })}
                  {filteredComboRows.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: 28, textAlign: "center", color: "var(--color-text-muted)" }}>
                        No combinations match that search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

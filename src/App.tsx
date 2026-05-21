import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

interface StandingTeam {
  standingRank: number;
  pick: number;
  name: string;
  lottery: boolean;
  odds: number;
  combos: number;
  protected?: { top: number; transferTo: string };
}

interface Prospect {
  rank: number;
  name: string;
  pos: string;
  league: string;
  team?: string;
}

interface DraftPick {
  team: string;
  pick: number;
  note: string;
  player: Prospect | null;
}

interface LotteryComboRow {
  id: number;
  balls: [number, number, number, number];
  team: string;
  teamCode: string;
  teamSequence: number | null;
}

interface LotteryAssignment {
  team: string;
  pick: number;
  source: "draw" | "default";
}

type ProspectPositionFilter = "all" | "centers" | "wingers" | "forwards" | "defense" | "goalies";

const COMBOS_CSV_PATH = "/mock/combos.csv";
const PROSPECTS_CSV_PATH = "/mock/prospects.csv";
const INVERSE_STANDINGS_CSV_PATH = "/mock/inverse_standings.csv";
const REDRAW_COMBO = "11,12,13,14";

const REAL_PICK_1_BALLS = [7, 2, 11, 12];
const REAL_PICK_2_BALLS = [11, 4, 3, 7];

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

function splitCsvLine(line: string): string[] {
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

function parseComboCsv(csv: string): LotteryComboRow[] {
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [id, ball1, ball2, ball3, ball4, teamCode, teamName, teamSequence] = splitCsvLine(line);

      return {
        id: Number(id),
        balls: [Number(ball1), Number(ball2), Number(ball3), Number(ball4)] as [
          number,
          number,
          number,
          number
        ],
        teamCode,
        team: teamName,
        teamSequence: teamSequence ? Number(teamSequence) : null,
      };
    });
}

function parseProspectsCsv(csv: string): Prospect[] {
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [rank, name, pos, league, team] = splitCsvLine(line);

      return {
        rank: Number(rank),
        name,
        pos,
        league: league ?? "",
        team: team || undefined,
      };
    })
    .filter((prospect) => Number.isFinite(prospect.rank) && prospect.name)
    .sort((a, b) => a.rank - b.rank);
}


function parseInverseStandingsCsv(csv: string): StandingTeam[] {
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [standingRank, pick, team, lottery, odds, combos, protectedTop, transferTo] = splitCsvLine(line);
      const isLottery = lottery.trim().toLowerCase() === "true" || lottery.trim().toLowerCase() === "yes";

      const parsed: StandingTeam = {
        standingRank: Number(standingRank),
        pick: Number(pick),
        name: team,
        lottery: isLottery,
        odds: odds ? Number(odds) : 0,
        combos: combos ? Number(combos) : 0,
      };

      if (protectedTop && transferTo) {
        parsed.protected = {
          top: Number(protectedTop),
          transferTo,
        };
      }

      return parsed;
    })
    .filter((team) => Number.isFinite(team.standingRank) && Number.isFinite(team.pick) && team.name)
    .sort((a, b) => a.pick - b.pick);
}

function prospectMatchesPositionFilter(prospect: Prospect, filter: ProspectPositionFilter): boolean {
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

function getAliveTeams(comboRows: LotteryComboRow[], drawnSorted: number[]): Set<string> {
  const alive = new Set<string>();

  for (const row of comboRows) {
    if (row.teamCode === "REDRAW") continue;
    if (drawnSorted.every((ball) => row.balls.includes(ball))) {
      alive.add(row.team);
    }
  }

  return alive;
}

function getPossibleFourthBallsByTeam(
  comboRows: LotteryComboRow[],
  drawnSorted: number[]
): Record<string, number[]> {
  if (drawnSorted.length !== 3) return {};

  const map: Record<string, Set<number>> = {};

  for (const row of comboRows) {
    if (row.teamCode === "REDRAW") continue;
    if (!drawnSorted.every((ball) => row.balls.includes(ball))) continue;

    const missingBall = row.balls.find((ball) => !drawnSorted.includes(ball));
    if (missingBall === undefined) continue;

    if (!map[row.team]) map[row.team] = new Set<number>();
    map[row.team].add(missingBall);
  }

  return Object.fromEntries(
    Object.entries(map).map(([team, balls]) => [team, [...balls].sort((a, b) => a - b)])
  );
}

function resolveCombo(comboRows: LotteryComboRow[], balls: number[]): LotteryComboRow | null {
  const sortedKey = [...balls].sort((a, b) => a - b).join(",");

  if (sortedKey === REDRAW_COMBO) {
    return {
      id: 1001,
      balls: [11, 12, 13, 14],
      team: "Redraw",
      teamCode: "REDRAW",
      teamSequence: null,
    };
  }

  return comboRows.find((row) => row.balls.join(",") === sortedKey) ?? null;
}

function resolveProtection(teamName: string, pickNum: number, lotteryTeams: StandingTeam[]): DraftPick {
  const td = lotteryTeams.find((t) => t.name === teamName);
  if (!td?.protected) return { team: teamName, pick: pickNum, note: "", player: null };

  const { top, transferTo } = td.protected;
  if (pickNum <= top) return { team: teamName, pick: pickNum, note: "", player: null };

  return {
    team: transferTo,
    pick: pickNum,
    note: `(via ${teamName}, protected top-${top})`,
    player: null,
  };
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatProspectMeta(prospect: Prospect): string {
  return [prospect.pos, prospect.league, prospect.team].filter(Boolean).join(" · ");
}

function getLotteryRank(teamName: string, lotteryTeams: StandingTeam[]): number {
  return lotteryTeams.findIndex((team) => team.name === teamName) + 1;
}

function getHighestAllowedPick(teamName: string, lotteryTeams: StandingTeam[]): number {
  const rank = getLotteryRank(teamName, lotteryTeams);
  if (rank <= 0) return lotteryTeams.length || 16;

  return Math.max(1, rank - 10);
}

function getOccupiedPicks(assignments: LotteryAssignment[]): Set<number> {
  return new Set(assignments.map((assignment) => assignment.pick));
}

function getAssignedTeams(assignments: LotteryAssignment[]): Set<string> {
  return new Set(assignments.map((assignment) => assignment.team));
}

function getAwardedPick(
  teamName: string,
  targetPick: number,
  occupiedPicks: Set<number>,
  lotteryTeams: StandingTeam[]
): number {
  const highestAllowedPick = getHighestAllowedPick(teamName, lotteryTeams);
  const lastLotteryPick = lotteryTeams.length || 16;
  const firstPossiblePick = Math.max(targetPick, highestAllowedPick);

  for (let pick = firstPossiblePick; pick <= lastLotteryPick; pick++) {
    if (!occupiedPicks.has(pick)) return pick;
  }

  return firstPossiblePick;
}

function buildLotterySlots(assignments: LotteryAssignment[], lotteryTeams: StandingTeam[]): Record<number, string> {
  const slots: Record<number, string> = {};
  const assignedTeams = getAssignedTeams(assignments);
  const lastLotteryPick = lotteryTeams.length || 16;

  [...assignments]
    .sort((a, b) => a.pick - b.pick)
    .forEach((assignment) => {
      slots[assignment.pick] = assignment.team;
    });

  const remainingLotteryTeams = lotteryTeams.map((team) => team.name).filter(
    (teamName) => !assignedTeams.has(teamName)
  );

  let remainingIdx = 0;

  for (let pick = 1; pick <= lastLotteryPick; pick++) {
    if (slots[pick]) continue;

    slots[pick] = remainingLotteryTeams[remainingIdx];
    remainingIdx++;
  }

  return slots;
}

function getNextOpenLotteryPick(assignments: LotteryAssignment[], lotteryTeams: StandingTeam[]): number {
  const occupiedPicks = getOccupiedPicks(assignments);
  const lastLotteryPick = lotteryTeams.length || 16;

  for (let pick = 1; pick <= lastLotteryPick; pick++) {
    if (!occupiedPicks.has(pick)) return pick;
  }

  return lastLotteryPick;
}

function getDefaultTeamForPick(
  assignments: LotteryAssignment[],
  pick: number,
  lotteryTeams: StandingTeam[]
): string | null {
  return buildLotterySlots(assignments, lotteryTeams)[pick] ?? null;
}

function applyLotteryDrawAssignment(
  existingAssignments: LotteryAssignment[],
  winner: string,
  targetPick: number,
  lotteryTeams: StandingTeam[]
): { assignments: LotteryAssignment[]; awardedPick: number; defaultLockedTeam: string | null } {
  const occupiedPicks = getOccupiedPicks(existingAssignments);
  const awardedPick = getAwardedPick(winner, targetPick, occupiedPicks, lotteryTeams);
  const drawAssignment: LotteryAssignment = { team: winner, pick: awardedPick, source: "draw" };
  const withWinner = [...existingAssignments, drawAssignment];

  if (awardedPick === targetPick) {
    return { assignments: withWinner, awardedPick, defaultLockedTeam: null };
  }

  const defaultLockedTeam = getDefaultTeamForPick(withWinner, targetPick, lotteryTeams);

  if (!defaultLockedTeam || getAssignedTeams(withWinner).has(defaultLockedTeam)) {
    return { assignments: withWinner, awardedPick, defaultLockedTeam: null };
  }

  return {
    assignments: [...withWinner, { team: defaultLockedTeam, pick: targetPick, source: "default" }],
    awardedPick,
    defaultLockedTeam,
  };
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

export default function App() {
  const pickLockRef = useRef(false);

  // useEffect(() => {
  //   document.title = "NHL Mock Draft Simulator";
  // }, []);

  const [comboRows, setComboRows] = useState<LotteryComboRow[]>([]);
  const [csvStatus, setCsvStatus] = useState("Loading NHL combination table...");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [prospectStatus, setProspectStatus] = useState("Loading prospects...");
  const [standingTeams, setStandingTeams] = useState<StandingTeam[]>([]);
  const [standingsStatus, setStandingsStatus] = useState("Loading inverse standings...");

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
    fetch(INVERSE_STANDINGS_CSV_PATH)
      .then((res) => {
        if (!res.ok) throw new Error("Inverse standings CSV not found");
        return res.text();
      })
      .then((text) => {
        const parsed = parseInverseStandingsCsv(text);
        setStandingTeams(parsed);
        setStandingsStatus(`Loaded ${parsed.length} inverse standings rows.`);
      })
      .catch(() => {
        setStandingsStatus("Could not load inverse_standings.csv. Make sure inverse_standings.csv is in /public/mock.");
      });
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

  const lotteryTeams = useMemo(
    () => standingTeams.filter((team) => team.lottery).sort((a, b) => a.pick - b.pick),
    [standingTeams]
  );

  const nonLotteryTeams = useMemo(
    () => standingTeams.filter((team) => !team.lottery).sort((a, b) => a.pick - b.pick),
    [standingTeams]
  );

  const sortedDrawn = useMemo(() => [...drawnBalls].sort((a, b) => a - b), [drawnBalls]);

  const aliveTeams = useMemo(() => {
    if (drawnBalls.length === 0 || drawnBalls.length >= 4 || lottoDone) {
      return new Set(lotteryTeams.map((t) => t.name));
    }

    return getAliveTeams(comboRows, sortedDrawn);
  }, [comboRows, drawnBalls.length, lottoDone, lotteryTeams, sortedDrawn]);

  const possibleFourthBallsByTeam = useMemo(() => {
    if (drawnBalls.length !== 3 || lottoDone) return {};
    return getPossibleFourthBallsByTeam(comboRows, sortedDrawn);
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

          updated[nextOpenPickIdx] = {
            ...updated[nextOpenPickIdx],
            player: manualProspect,
          };

          latestTaken.add(manualProspect.rank);
        }

        if (mode === "auto-next") {
          const nextProspect = prospects.find((prospect) => !latestTaken.has(prospect.rank));

          if (!nextProspect) {
            pickLockRef.current = false;
            return updated;
          }

          updated[nextOpenPickIdx] = {
            ...updated[nextOpenPickIdx],
            player: nextProspect,
          };

          latestTaken.add(nextProspect.rank);
        }

        if (mode === "auto-all") {
          let idx = nextOpenPickIdx;

          while (idx < updated.length) {
            if (updated[idx].player) {
              idx++;
              continue;
            }

            const nextProspect = prospects.find((prospect) => !latestTaken.has(prospect.rank));
            if (!nextProspect) break;

            updated[idx] = {
              ...updated[idx],
              player: nextProspect,
            };

            latestTaken.add(nextProspect.rank);
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

  const currentTargetPick = useMemo(() => getNextOpenLotteryPick(lotteryAssignments, lotteryTeams), [lotteryAssignments, lotteryTeams]);

  const buildOrderFromLotteryAssignments = useCallback((assignments: LotteryAssignment[]) => {
    const slots = buildLotterySlots(assignments, lotteryTeams);
    const order: DraftPick[] = [];

    lotteryTeams.forEach((team) => {
      order.push(resolveProtection(slots[team.pick], team.pick, lotteryTeams));
    });

    nonLotteryTeams.forEach((team) => {
      order.push({ team: team.name, pick: team.pick, note: "", player: null });
    });

    return order.sort((a, b) => a.pick - b.pick);
  }, [lotteryTeams, nonLotteryTeams]);

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

      if (!resolved || resolved.teamCode === "REDRAW") {
        setResultLabel("REDRAW — Invalid combo [11-12-13-14]");
        setResultTeam("");

        setTimeout(() => {
          setDrawnBalls([]);
          setNewBallIdx(null);
          setResultLabel(draw === 1 ? "Draw 1 ready" : `Draw ${draw} ready`);
        }, 1800);

        return;
      }

      const winner = resolved.team;
      const alreadyAssigned = assignmentsBeforeDraw.some((assignment) => assignment.team === winner);

      if (alreadyAssigned || winner === p1w) {
        setResultLabel("REDRAW — Team already assigned a pick");
        setResultTeam(winner);

        setTimeout(() => {
          setDrawnBalls([]);
          setNewBallIdx(null);
          setResultLabel(`Draw ${draw} ready`);
          setResultTeam("");
        }, 1800);

        return;
      }

      const targetPick = getNextOpenLotteryPick(assignmentsBeforeDraw, lotteryTeams);
      const { assignments, awardedPick, defaultLockedTeam } = applyLotteryDrawAssignment(
        assignmentsBeforeDraw,
        winner,
        targetPick,
        lotteryTeams
      );

      if (draw === 1) {
        setPick1Winner(winner);
        setPick1AwardedSlot(awardedPick);
        setLotteryAssignments(assignments);
        setResultLabel(awardedPick === targetPick ? `Pick ${targetPick} awarded to` : `Lottery win — moves up to Pick ${awardedPick}`);
        setResultTeam(
          defaultLockedTeam
            ? `${winner} · ${defaultLockedTeam} locks Pick ${targetPick}`
            : winner
        );

        setTimeout(() => {
          const nextPick = getNextOpenLotteryPick(assignments, lotteryTeams);
          setCurrentDraw(2);
          setDrawnBalls([]);
          setNewBallIdx(null);
          setResultLabel(`Draw 2 ready — Pick ${nextPick}`);
          setResultTeam("");
        }, 1400);

        return;
      }

      setPick2Winner(winner);
      setPick2AwardedSlot(awardedPick);
      setLotteryAssignments(assignments);
      setResultLabel(awardedPick === targetPick ? `Pick ${targetPick} awarded to` : `Lottery win — moves up to Pick ${awardedPick}`);
      setResultTeam(
        defaultLockedTeam
          ? `${winner} · ${defaultLockedTeam} locks Pick ${targetPick}`
          : winner
      );

      finalizeLottery(assignments);
    },
    [comboRows, finalizeLottery, lotteryTeams]
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
  }, []);

  const useRealResults = useCallback(() => {
    if (comboRows.length === 0 || lotteryTeams.length === 0) return;

    resetLottery();

    setDrawnBalls(REAL_PICK_2_BALLS);
    setCurrentDraw(2);
    setPick1Winner("Toronto");
    setPick2Winner("San Jose");
    setPick1AwardedSlot(1);
    setPick2AwardedSlot(2);
    setResultLabel("Real 2026 NHL lottery result");
    setResultTeam("Toronto — Pick 1 · San Jose — Pick 2");

    const realAssignments: LotteryAssignment[] = [
      { team: "Toronto", pick: 1, source: "draw" },
      { team: "San Jose", pick: 2, source: "draw" },
    ];

    setLotteryAssignments(realAssignments);
    finalizeLottery(realAssignments);

    setLottoDone(true);
    setNewBallIdx(null);
  }, [comboRows.length, finalizeLottery, lotteryTeams.length, resetLottery]);

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
    const lines = draftPicks
      .map(
        (p) =>
          `${p.pick}. ${p.team}${p.note ? " " + p.note : ""}: ${p.player ? `${p.player.name} (${formatProspectMeta(p.player)})` : "—"
          }`
      )
      .join("\n");

    navigator.clipboard.writeText(`2026 NHL Mock Draft - Round 1\n\n${lines}`).then(() => {
      setCopyLabel("Copied!");
      setTimeout(() => setCopyLabel("Copy Results"), 2000);
    });
  }, [draftPicks]);

  const saveDraft = useCallback(() => {
    const renderPickCard = (pick: DraftPick) => {
      const playerName = pick.player ? pick.player.name : "—";
      const playerMeta = pick.player ? formatProspectMeta(pick.player) : "Unselected";

      return `
        <div class="pick-card">
          <div class="pick-number">${escapeHtml(pick.pick)}</div>
          <div class="pick-main">
            <div class="team-name">${escapeHtml(pick.team)}</div>
            ${pick.note ? `<div class="pick-note">${escapeHtml(pick.note)}</div>` : ""}
          </div>
          <div class="selection-main">
            <div class="player-name">${escapeHtml(playerName)}</div>
            <div class="player-meta">${escapeHtml(playerMeta)}</div>
          </div>
        </div>
      `;
    };

    const firstColumn = draftPicks.slice(0, 16).map(renderPickCard).join("");
    const secondColumn = draftPicks.slice(16, 32).map(renderPickCard).join("");

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>2026 NHL Mock Draft - Round 1</title>
  <style>
    * {
      box-sizing: border-box;
    }

    @page {
      size: letter portrait;
      margin: 0.22in;
    }

    html,
    body {
      margin: 0;
      min-height: 100%;
      background: #0a0e1a;
      color: #111;
      font-family: Arial, Helvetica, sans-serif;
    }

    body {
      padding: 18px;
    }

    .page {
      width: 8.06in;
      min-height: 10.56in;
      margin: 0 auto;
      background: #fff;
      color: #111;
      border-radius: 14px;
      box-shadow: 0 18px 50px rgba(0, 0, 0, .28);
      padding: 0.18in;
      overflow: hidden;
    }

    .header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-end;
      padding-bottom: 0.08in;
      border-bottom: 2px solid #111;
      margin-bottom: 0.10in;
    }

    h1 {
      margin: 0;
      color: #111;
      font-size: 20px;
      letter-spacing: .55px;
      text-transform: uppercase;
      line-height: .95;
    }

    .subtitle {
      margin-top: 4px;
      color: #444;
      font-size: 10px;
      line-height: 1;
    }

    .status {
      color: #111;
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: .55px;
      text-transform: uppercase;
      white-space: nowrap;
      line-height: 1;
    }

    .draft-columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.13in;
      align-items: start;
    }

    .column-header {
      display: grid;
      grid-template-columns: 0.28in minmax(0, 1fr) minmax(0, 1.18fr);
      gap: 0.05in;
      padding: 0 0.04in 0.05in;
      border-bottom: 1px solid #111;
      color: #111;
      font-size: 7.5px;
      font-weight: 800;
      letter-spacing: .45px;
      text-transform: uppercase;
      line-height: 1;
    }

    .pick-card {
      display: grid;
      grid-template-columns: 0.28in minmax(0, 1fr) minmax(0, 1.18fr);
      gap: 0.05in;
      align-items: center;
      height: 0.52in;
      padding: 0.045in 0.04in;
      border-bottom: 1px solid #d7d7d7;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .pick-card:last-child {
      border-bottom: none;
    }

    .pick-number {
      color: #111;
      text-align: center;
      font-size: 13px;
      font-weight: 900;
      line-height: 1;
    }

    .team-name,
    .player-name {
      color: #111;
      font-size: 9.2px;
      font-weight: 800;
      line-height: 1.05;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .pick-note,
    .player-meta {
      color: #555;
      font-size: 7.1px;
      line-height: 1.05;
      margin-top: 1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 12px;
      gap: 10px;
    }

    button {
      background: #222d42;
      color: #f5c842;
      border: 1px solid #f5c842;
      border-radius: 10px;
      padding: 10px 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .6px;
      cursor: pointer;
    }

    @media print {
      html,
      body {
        width: 100%;
        height: 100%;
        overflow: hidden;
      }

      body {
        background: #fff;
        color: #111;
        padding: 0;
      }

      .page {
        width: 100%;
        height: 100%;
        min-height: 0;
        max-height: none;
        margin: 0;
        border: none;
        border-radius: 0;
        box-shadow: none;
        padding: 0;
        background: #fff;
        overflow: hidden;
      }

      .header {
        margin-bottom: 0.08in;
        padding-bottom: 0.07in;
      }

      .draft-columns {
        gap: 0.12in;
      }

      .column-header {
        padding-bottom: 0.045in;
      }

      .pick-card {
        height: 0.51in;
        padding-top: 0.04in;
        padding-bottom: 0.04in;
      }

      .actions {
        display: none;
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <div class="header">
      <div>
        <h1>2026 NHL Mock Draft</h1>
        <div class="subtitle">Round 1 · Picks 1-32</div>
      </div>
      <div class="status">${isDraftDone ? "Draft Complete" : "Draft In Progress"}</div>
    </div>

    <div class="draft-columns">
      <section>
        <div class="column-header">
          <div>Pick</div>
          <div>Team</div>
          <div>Selection</div>
        </div>
        ${firstColumn}
      </section>

      <section>
        <div class="column-header">
          <div>Pick</div>
          <div>Team</div>
          <div>Selection</div>
        </div>
        ${secondColumn}
      </section>
    </div>

    <div class="actions">
      <button onclick="window.print()">Print / Save PDF</button>
    </div>
  </main>
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
    link.download = "2026-nhl-mock-draft.html";
    link.click();

    URL.revokeObjectURL(url);
  }, [draftPicks, isDraftDone]);

  const filteredProspects = prospects.filter((p) => {
    const searchLower = search.toLowerCase();

    const matchesSearch =
      p.name.toLowerCase().includes(searchLower) ||
      p.pos.toLowerCase().includes(searchLower) ||
      p.league.toLowerCase().includes(searchLower) ||
      (p.team ?? "").toLowerCase().includes(searchLower);

    return !takenProspects.has(p.rank) && matchesSearch && prospectMatchesPositionFilter(p, positionFilter);
  });

  const filteredComboRows = useMemo(() => {
    const searchLower = lookupSearch.trim().toLowerCase();

    if (!searchLower) return comboRows;

    return comboRows.filter((row) => {
      const ballDashText = row.balls.join("-");
      const ballCommaText = row.balls.join(",");
      const ballSpaceText = row.balls.join(" ");
      const sequenceText = row.teamSequence === null ? "" : String(row.teamSequence);

      return (
        String(row.id).includes(searchLower) ||
        row.team.toLowerCase().includes(searchLower) ||
        row.teamCode.toLowerCase().includes(searchLower) ||
        sequenceText.includes(searchLower) ||
        ballDashText.includes(searchLower) ||
        ballCommaText.includes(searchLower) ||
        ballSpaceText.includes(searchLower)
      );
    });
  }, [comboRows, lookupSearch]);

  const S: Record<string, CSSProperties> = {
    app: {
      maxWidth: 1120,
      margin: "0 auto",
      padding: 24,
      fontFamily: "'Barlow', sans-serif",
      background: "#0a0e1a",
      minHeight: "100vh",
      color: "#e2e8f0",
    },
    header: {
      textAlign: "center",
      padding: "28px 0 22px",
      borderBottom: "1px solid #2d3a50",
      marginBottom: 24,
    },
    h1: {
      fontFamily: "'Barlow Condensed', sans-serif",
      fontSize: 46,
      fontWeight: 900,
      letterSpacing: 2,
      color: "#f5c842",
      textTransform: "uppercase",
      margin: 0,
    },
    sub: {
      color: "#94a3b8",
      fontSize: 14,
      letterSpacing: 0.5,
      marginTop: 4,
    },
    machineSection: {
      display: "grid",
      gridTemplateColumns: "1fr 390px",
      gap: 20,
      marginBottom: 24,
    },
    machine: {
      background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
      border: "1px solid #2d3a50",
      borderRadius: 16,
      boxShadow: "0 18px 50px rgba(0,0,0,.24)",
      padding: 24,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 14,
    },
    machineTitleStyle: {
      fontFamily: "'Barlow Condensed', sans-serif",
      fontSize: 28,
      fontWeight: 700,
      letterSpacing: 2,
      color: "#7dd3f5",
      textTransform: "uppercase",
    },
    phaseLabel: {
      fontSize: 13,
      color: "#94a3b8",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    ballDisplay: {
      width: 340,
      height: 156,
      background: "#1a2236",
      border: "1px solid #2d3a50",
      borderRadius: 78,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      padding: "0 26px",
      overflow: "hidden",
    },
    comboBox: {
      background: "#1a2236",
      border: "1px solid #2d3a50",
      borderRadius: 12,
      padding: "12px 22px",
      textAlign: "center",
      width: "100%",
    },
    comboLabel: {
      fontSize: 13,
      color: "#94a3b8",
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 6,
    },
    comboNumbers: {
      fontFamily: "'Barlow Condensed', sans-serif",
      fontSize: 34,
      fontWeight: 700,
      color: "#f5c842",
      letterSpacing: 4,
      minHeight: 42,
    },
    resultBanner: {
      background: "#1a2236",
      border: "1px solid #2d3a50",
      borderRadius: 12,
      padding: "12px 16px",
      textAlign: "center",
      minHeight: 62,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
    },
    resultPickLabel: {
      fontSize: 13,
      color: "#94a3b8",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    resultTeamName: {
      fontFamily: "'Barlow Condensed', sans-serif",
      fontSize: 28,
      fontWeight: 700,
      color: "#22c55e",
      letterSpacing: 1,
    },
    btnRow: {
      display: "flex",
      gap: 12,
      width: "100%",
      justifyContent: "center",
      flexWrap: "wrap",
    },
    oddsPanel: {
      background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
      border: "1px solid #2d3a50",
      borderRadius: 16,
      boxShadow: "0 18px 50px rgba(0,0,0,.24)",
      padding: 16,
      overflowY: "auto",
      maxHeight: 677,
    },
    drawingIndicator: {
      background: "#1a2236",
      border: "1px solid #2d3a50",
      borderRadius: 10,
      padding: "8px 12px",
      textAlign: "center",
      fontFamily: "'Barlow Condensed', sans-serif",
      fontSize: 15,
      fontWeight: 700,
      letterSpacing: 1,
      color: "#7dd3f5",
      textTransform: "uppercase",
    },
    oddsTitle: {
      fontFamily: "'Barlow Condensed', sans-serif",
      fontSize: 15,
      fontWeight: 700,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: "#94a3b8",
      marginBottom: 10,
      paddingBottom: 8,
      borderBottom: "1px solid #2d3a50",
      marginTop: 14,
    },
    draftSection: {
      background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
      border: "1px solid #2d3a50",
      borderRadius: 16,
      boxShadow: "0 18px 50px rgba(0,0,0,.24)",
      padding: 24,
    },
    draftLayout: {
      display: "grid",
      gridTemplateColumns: "1fr 340px",
      gap: 20,
    },
    draftBoardWrap: {
      overflowY: "auto",
      maxHeight: 783,
    },
  };

  const btn = (extra: CSSProperties = {}): CSSProperties => ({
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    border: "1px solid #2d3a50",
    borderRadius: 10,
    padding: "10px 18px",
    cursor: extra.cursor ?? "pointer",
    whiteSpace: "nowrap",
    background: "#222d42",
    color: "#94a3b8",
    ...extra,
  });

  const disabledBtn = (extra: CSSProperties = {}): CSSProperties =>
    btn({
      opacity: 0.45,
      cursor: "not-allowed",
      ...extra,
    });

  return (
    <div style={S.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=Barlow:wght@400;500;600&display=swap');

        @keyframes ballDrop {
          from { transform: translateY(-70px) scale(.7); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes aliveGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
          50% { box-shadow: 0 0 6px 2px rgba(34,197,94,0.25); }
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0a0e1a; }
        ::-webkit-scrollbar-thumb { background: #2d3a50; border-radius: 2px; }

        button:disabled,
        input:disabled,
        select:disabled {
          opacity: .45;
          cursor: not-allowed !important;
        }

        @media (max-width: 820px) {
          .nhl-machine-section,
          .nhl-draft-layout {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <header style={S.header}>
        <h1 style={S.h1}>2026 NHL Draft Lottery Simulator</h1>
        <div style={S.sub}>
          Simulate the 2026 NHL Draft Lottery, search NHL draft lottery combos, and build a full first-round NHL mock draft.
        </div>
        {/* <div style={S.sub}>
          {csvStatus} · {prospectStatus} · {standingsStatus}
        </div> */}
      </header>

      {lottoPhase === "lottery" && (
        <div className="nhl-machine-section" style={S.machineSection}>
          <section style={S.machine}>
            <div style={S.machineTitleStyle}>Lottery Draw</div>
            <div style={S.phaseLabel}>
              {`Drawing ${currentDraw} — Pick ${currentTargetPick}`}
            </div>

            <div style={S.ballDisplay}>
              {[0, 1, 2, 3].map((idx) =>
                drawnBalls[idx] !== undefined ? (
                  <DrawnBall key={idx} n={drawnBalls[idx]} isNew={newBallIdx === idx} />
                ) : (
                  <BallSlot key={idx} idx={idx} />
                )
              )}
            </div>

            <div style={S.comboBox}>
              <div style={S.comboLabel}>Current combination</div>
              <div style={S.comboNumbers}>{comboDisplay}</div>
            </div>

            <div style={S.resultBanner}>
              <div style={S.resultPickLabel}>{resultLabel}</div>
              {resultTeam && <div style={S.resultTeamName}>{resultTeam}</div>}
            </div>

            <div style={S.btnRow}>
              <button
                style={btn({ background: "#f5c842", color: "#0a0e1a", borderColor: "#f5c842" })}
                onClick={drawOneBall}
                disabled={drawnBalls.length >= 4 || lottoDone || comboRows.length === 0 || lotteryTeams.length === 0}
              >
                Draw Ball
              </button>
              <button
                style={btn({ color: "#7dd3f5", borderColor: "#2d3a50" })}
                onClick={simDraw}
                disabled={drawnBalls.length >= 4 || lottoDone || comboRows.length === 0 || lotteryTeams.length === 0}
              >
                Simulate Draw
              </button>
              <button
                style={btn({ background: "#1d4ed8", color: "#dbeafe", borderColor: "#2563eb" })}
                onClick={useRealResults}
                disabled={comboRows.length === 0 || lotteryTeams.length === 0}
              >
                Use Real Result
              </button>
              <button
                style={btn({ color: "#f5c842", borderColor: "#f5c842" })}
                onClick={() => setLookupOpen(true)}
                disabled={comboRows.length === 0 || lotteryTeams.length === 0}
              >
                Combo Lookup
              </button>
            </div>

            <div style={S.btnRow}>
              <button style={btn({ color: "#ef4444", borderColor: "#ef4444" })} onClick={resetLottery}>
                Reset
              </button>
              {lottoDone && (
                <button
                  style={btn({ background: "#3b82f6", color: "#fff", borderColor: "#3b82f6" })}
                  onClick={() => setLottoPhase("draft")}
                  disabled={prospects.length === 0}
                >
                  Start Mock Draft
                </button>
              )}
            </div>

            <div style={{ fontSize: 14, color: "#94a3b8", textAlign: "center", lineHeight: 1.5 }}>
              {drawnBalls.length === 3 && !lottoDone
                ? "After three balls, the team list shows which fourth ball would complete each alive combination."
                : "Draw manually, simulate the remaining balls, or use the real-life lottery result."}
              <div style={{ marginTop: 6 }}>
                Real-result mode uses Toronto for Pick 1 ({REAL_PICK_1_BALLS.join(", ")}) and San Jose for Pick 2 (
                {REAL_PICK_2_BALLS.join(", ")}).
              </div>
            </div>
          </section>

          <aside style={S.oddsPanel}>
            <div style={S.drawingIndicator}>
              {drawnBalls.length === 3
                ? "3 balls drawn — possible fourth balls"
                : drawnBalls.length > 0 && drawnBalls.length < 4
                  ? "Teams still alive"
                  : lottoDone
                    ? "Lottery complete"
                    : `Draw ${currentDraw} of 2`}
            </div>

            <div style={S.oddsTitle}>Lottery Teams</div>
            {lotteryTeams.map((team, idx) => {
              const isP1 = pick1Winner === team.name;
              const isP2 = pick2Winner === team.name;
              const won = isP1 || isP2;
              const ballsDrawn = drawnBalls.length;
              const isAlive = ballsDrawn > 0 && ballsDrawn < 4 && aliveTeams.has(team.name);
              const isEliminated = ballsDrawn > 0 && ballsDrawn < 4 && !aliveTeams.has(team.name) && !lottoDone;
              const wonAndDone = lottoDone && won;
              const elimAndDone = lottoDone && !won;
              const fourthBalls = possibleFourthBallsByTeam[team.name] ?? [];
              const assignedLotteryPick = lottoDone
                ? Number(
                  Object.entries(buildLotterySlots(lotteryAssignments, lotteryTeams)).find(
                    ([, slotTeam]) => slotTeam === team.name
                  )?.[0] ?? idx + 1
                )
                : idx + 1;

              return (
                <div
                  key={team.name}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "26px 1fr 70px 72px",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 6px",
                    borderRadius: 10,
                    marginBottom: 6,
                    transition: "all .2s",
                    opacity: elimAndDone ? 0.28 : isEliminated ? 0.3 : 1,
                    background: wonAndDone ? "rgba(34,197,94,.08)" : isAlive ? "rgba(34,197,94,.05)" : "transparent",
                    border: wonAndDone
                      ? "1px solid rgba(34,197,94,.3)"
                      : isAlive
                        ? "1px solid rgba(34,197,94,.2)"
                        : "1px solid transparent",
                    animation: isAlive ? "aliveGlow 2s ease-in-out infinite" : "none",
                  }}
                >
                  <span
                    style={{
                      color: "#94a3b8",
                      fontSize: 13,
                      fontFamily: "'Barlow Condensed', sans-serif",
                    }}
                  >
                    {idx + 1}
                  </span>

                  <div>
                    <div
                      style={{
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontSize: 16,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: wonAndDone ? "#22c55e" : isAlive ? "#d1fae5" : "#e2e8f0",
                      }}
                    >
                      {team.name}
                      {team.protected ? "*" : ""}
                      {isAlive && !lottoDone && (
                        <span
                          style={{
                            marginLeft: 5,
                            fontSize: 9,
                            color: "#22c55e",
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            textTransform: "uppercase",
                          }}
                        >
                          Alive
                        </span>
                      )}
                      {isEliminated && (
                        <span
                          style={{
                            marginLeft: 5,
                            fontSize: 9,
                            color: "#ef4444",
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            textTransform: "uppercase",
                          }}
                        >
                          Out
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 2 }}>
                      {team.odds}% · {team.combos} combos
                    </div>

                    {fourthBalls.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                        {fourthBalls.map((ball) => (
                          <span
                            key={ball}
                            style={{
                              border: "1px solid #f5c842",
                              color: "#f5c842",
                              borderRadius: 999,
                              padding: "2px 6px",
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: "uppercase",
                            }}
                          >
                            Ball {ball}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <span
                    style={{
                      textAlign: "right",
                      color: "#f5c842",
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    {team.odds}%
                  </span>

                  <span style={{ textAlign: "center" }}>
                    {isP1 && (
                      <span
                        style={{
                          background: "rgba(34,197,94,.15)",
                          color: "#22c55e",
                          border: "1px solid rgba(34,197,94,.4)",
                          fontFamily: "'Barlow Condensed', sans-serif",
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "3px 7px",
                          borderRadius: 4,
                        }}
                      >
                        Pick {pick1AwardedSlot ?? 1}
                      </span>
                    )}
                    {isP2 && (
                      <span
                        style={{
                          background: "rgba(34,197,94,.15)",
                          color: "#22c55e",
                          border: "1px solid rgba(34,197,94,.4)",
                          fontFamily: "'Barlow Condensed', sans-serif",
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "3px 7px",
                          borderRadius: 4,
                        }}
                      >
                        Pick {pick2AwardedSlot ?? 2}
                      </span>
                    )}
                    {!won && (
                      <span
                        style={{
                          background: "#222d42",
                          color: "#f5c842",
                          border: "1px solid #2d3a50",
                          fontFamily: "'Barlow Condensed', sans-serif",
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "3px 7px",
                          borderRadius: 4,
                        }}
                      >
                        {assignedLotteryPick}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}

            <div style={S.oddsTitle}>Non-Lottery Order</div>
            {nonLotteryTeams.map((team) => (
              <div
                key={team.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "26px 1fr 70px 72px",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 6px",
                }}
              >
                <span
                  style={{
                    color: "#94a3b8",
                    fontSize: 11,
                    fontFamily: "'Barlow Condensed', sans-serif",
                  }}
                >
                  {team.pick}
                </span>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, color: "#94a3b8" }}>
                  {team.name}
                </span>
                <span style={{ textAlign: "right", color: "#94a3b8", fontSize: 13 }}>—</span>
                <span />
              </div>
            ))}
          </aside>
        </div>
      )}

      {lottoPhase === "draft" && (
        <div style={S.draftSection}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <h2
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: 2,
                color: "#f5c842",
                textTransform: "uppercase",
              }}
            >
              2026 Mock Draft - Round 1
            </h2>
            <div style={S.btnRow}>
              <button
                style={btn({ color: "#7dd3f5", borderColor: "#7dd3f5" })}
                onClick={() => setLottoPhase("lottery")}
              >
                Back to Lottery
              </button>
              <button
                style={
                  draftActionDisabled
                    ? disabledBtn({ color: "#22c55e", borderColor: "#22c55e" })
                    : btn({ color: "#22c55e", borderColor: "#22c55e" })
                }
                onClick={autoPickAll}
                disabled={draftActionDisabled}
              >
                Auto-Pick All
              </button>
              <button style={btn({ color: "#f5c842", borderColor: "#f5c842" })} onClick={copyResults}>
                {copyLabel}
              </button>
              <button
                style={
                  draftPicks.length === 0
                    ? disabledBtn({ color: "#22c55e", borderColor: "#22c55e" })
                    : btn({ color: "#22c55e", borderColor: "#22c55e" })
                }
                onClick={saveDraft}
                disabled={draftPicks.length === 0}
              >
                Save Draft
              </button>
              <button style={btn({ color: "#ef4444", borderColor: "#ef4444" })} onClick={resetLottery}>
                New Simulation
              </button>
            </div>
          </div>

          <div className="nhl-draft-layout" style={S.draftLayout}>
            <div style={S.draftBoardWrap}>
              {draftPicks.map((pick, idx) => {
                const onClock = idx === currentPickIdx && !isDraftDone;
                const numCls =
                  pick.pick === 1
                    ? "#f5c842"
                    : pick.pick === 2
                      ? "#c0c0c0"
                      : pick.pick === 3
                        ? "#cd7f32"
                        : "#94a3b8";

                return (
                  <div
                    key={`${pick.pick}-${pick.team}`}
                    style={{
                      background: onClock ? "rgba(245,200,66,.05)" : "#1a2236",
                      border: `1px solid ${onClock ? "#f5c842" : "#2d3a50"}`,
                      borderRadius: 7,
                      padding: "11px 14px",
                      display: "grid",
                      gridTemplateColumns: "44px 1fr",
                      gap: 12,
                      alignItems: "center",
                      marginBottom: 8,
                      animation: pick.player ? "fadeIn .25s ease" : "none",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontSize: 32,
                        fontWeight: 900,
                        color: numCls,
                        textAlign: "center",
                        lineHeight: 1,
                      }}
                    >
                      {pick.pick}
                    </div>
                    <div>
                      {onClock && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "#f5c842",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            marginBottom: 1,
                          }}
                        >
                          On the clock
                        </div>
                      )}
                      <div
                        style={{
                          fontFamily: "'Barlow Condensed', sans-serif",
                          fontSize: 18,
                          fontWeight: 700,
                          color: "#e2e8f0",
                        }}
                      >
                        {pick.team}
                      </div>
                      {pick.player ? (
                        <div style={{ fontSize: 13, color: "#7dd3f5", marginTop: 2 }}>
                          {pick.player.name}
                          {formatProspectMeta(pick.player) ? ` (${formatProspectMeta(pick.player)})` : ""}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: "#2d3a50", fontStyle: "italic", marginTop: 2 }}>—</div>
                      )}
                      {pick.note && <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 2 }}>{pick.note}</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              {!isDraftDone ? (
                <div
                  style={{
                    background: "#1a2236",
                    border: "1px solid #2d3a50",
                    borderRadius: 10,
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 18,
                      fontWeight: 700,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: "#7dd3f5",
                      paddingBottom: 6,
                      borderBottom: "1px solid #2d3a50",
                    }}
                  >
                    Available Prospects
                  </div>

                  <div
                    style={{
                      background: "rgba(245,200,66,.07)",
                      border: "1px solid rgba(245,200,66,.28)",
                      borderRadius: 7,
                      padding: "10px 12px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 13, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Pick #{curPick?.pick}
                    </div>
                    <div
                      style={{
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontSize: 22,
                        fontWeight: 700,
                        color: "#f5c842",
                      }}
                    >
                      {curPick?.team}
                    </div>
                    {curPick?.note && <div style={{ fontSize: 12, color: "#94a3b8" }}>{curPick.note}</div>}
                  </div>

                  <button
                    style={{
                      ...(draftActionDisabled
                        ? disabledBtn({ color: "#7dd3f5", borderColor: "#7dd3f5", width: "100%" })
                        : btn({ color: "#7dd3f5", borderColor: "#7dd3f5", width: "100%" })),
                      textAlign: "center",
                    }}
                    onClick={autoPick}
                    disabled={draftActionDisabled}
                  >
                    Auto-Pick Next
                  </button>

                  <input
                    style={{
                      width: "100%",
                      background: "#222d42",
                      border: "1px solid #2d3a50",
                      borderRadius: 10,
                      padding: "10px 12px",
                      color: "#e2e8f0",
                      fontFamily: "'Barlow', sans-serif",
                      fontSize: 15,
                      outline: "none",
                    }}
                    placeholder="Search prospects"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setSelectedProspect(null);
                    }}
                    disabled={draftActionDisabled}
                  />

                  <select
                    style={{
                      width: "100%",
                      background: "#222d42",
                      border: "1px solid #2d3a50",
                      borderRadius: 10,
                      padding: "10px 12px",
                      color: "#e2e8f0",
                      fontFamily: "'Barlow', sans-serif",
                      fontSize: 15,
                      outline: "none",
                      cursor: draftActionDisabled ? "not-allowed" : "pointer",
                    }}
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

                  <div style={{ overflowY: "auto", maxHeight: 380, display: "flex", flexDirection: "column", gap: 3 }}>
                    {filteredProspects.map((prospect) => (
                      <div
                        key={prospect.rank}
                        onClick={() => {
                          if (!draftActionDisabled && !takenProspects.has(prospect.rank)) {
                            setSelectedProspect(prospect);
                          }
                        }}
                        style={{
                          background: selectedProspect?.rank === prospect.rank ? "rgba(59,130,246,.12)" : "#222d42",
                          border: `1px solid ${selectedProspect?.rank === prospect.rank ? "#3b82f6" : "#2d3a50"}`,
                          borderRadius: 10,
                          padding: "10px 12px",
                          cursor: draftActionDisabled ? "not-allowed" : "pointer",
                          opacity: draftActionDisabled ? 0.5 : 1,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span
                            style={{
                              fontFamily: "'Barlow Condensed', sans-serif",
                              fontSize: 13,
                              color: "#f5c842",
                              fontWeight: 700,
                            }}
                          >
                            #{prospect.rank}
                          </span>
                          <span
                            style={{
                              fontFamily: "'Barlow Condensed', sans-serif",
                              fontSize: 17,
                              fontWeight: 700,
                              color: "#e2e8f0",
                            }}
                          >
                            {prospect.name}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>
                          {formatProspectMeta(prospect)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    style={{
                      width: "100%",
                      background: selectedProspect && !draftActionDisabled ? "#3b82f6" : "#222d42",
                      color: selectedProspect && !draftActionDisabled ? "#fff" : "#94a3b8",
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 18,
                      fontWeight: 700,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      border: "none",
                      borderRadius: 7,
                      padding: 10,
                      cursor: selectedProspect && !draftActionDisabled ? "pointer" : "not-allowed",
                    }}
                    onClick={makePick}
                    disabled={!selectedProspect || draftActionDisabled}
                  >
                    {selectedProspect && !draftActionDisabled ? `Draft ${selectedProspect.name}` : "Select a Prospect"}
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    background: "#1a2236",
                    border: "1px solid #2d3a50",
                    borderRadius: 10,
                    padding: 24,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 28,
                      fontWeight: 700,
                      color: "#f5c842",
                      marginBottom: 10,
                    }}
                  >
                    Draft Complete
                  </div>
                  <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 18 }}>
                    All 32 picks have been made.
                  </div>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                    <button style={btn({ color: "#f5c842", borderColor: "#f5c842" })} onClick={copyResults}>
                      {copyLabel}
                    </button>
                    <button style={btn({ color: "#22c55e", borderColor: "#22c55e" })} onClick={saveDraft}>
                      Save Draft
                    </button>
                    <button style={btn({ color: "#ef4444", borderColor: "#ef4444" })} onClick={resetLottery}>
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
        <div
          onClick={() => setLookupOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,.78)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(1040px, 100%)",
              maxHeight: "86vh",
              background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
              border: "1px solid #2d3a50",
              borderRadius: 16,
              boxShadow: "0 24px 70px rgba(0,0,0,.45)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "18px 20px",
                borderBottom: "1px solid #2d3a50",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 28,
                    fontWeight: 900,
                    letterSpacing: 1.5,
                    color: "#f5c842",
                    textTransform: "uppercase",
                    lineHeight: 1,
                  }}
                >
                  Lottery Combination Lookup
                </div>
                <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 6 }}>
                  Search by team, team code, combination ID, sequence number, or balls.
                </div>
              </div>

              <button
                style={btn({ color: "#ef4444", borderColor: "#ef4444", padding: "8px 13px" })}
                onClick={() => setLookupOpen(false)}
              >
                Close
              </button>
            </div>

            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid #2d3a50",
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12,
                alignItems: "center",
              }}
            >
              <input
                style={{
                  width: "100%",
                  background: "#222d42",
                  border: "1px solid #2d3a50",
                  borderRadius: 10,
                  padding: "11px 13px",
                  color: "#e2e8f0",
                  fontFamily: "'Barlow', sans-serif",
                  fontSize: 15,
                  outline: "none",
                }}
                placeholder="Search combos, teams, balls, or IDs"
                value={lookupSearch}
                onChange={(event) => setLookupSearch(event.target.value)}
                autoFocus
              />
              <div style={{ color: "#94a3b8", fontSize: 13, whiteSpace: "nowrap" }}>
                {filteredComboRows.length} / {comboRows.length} combos
              </div>
            </div>

            <div style={{ overflow: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 14,
                }}
              >
                <thead
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#111827",
                    zIndex: 1,
                  }}
                >
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "11px 14px",
                        color: "#7dd3f5",
                        borderBottom: "1px solid #2d3a50",
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontSize: 14,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        width: 90,
                      }}
                    >
                      ID
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "11px 14px",
                        color: "#7dd3f5",
                        borderBottom: "1px solid #2d3a50",
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontSize: 14,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        width: 180,
                      }}
                    >
                      Balls
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "11px 14px",
                        color: "#7dd3f5",
                        borderBottom: "1px solid #2d3a50",
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontSize: 14,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      Team
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "11px 14px",
                        color: "#7dd3f5",
                        borderBottom: "1px solid #2d3a50",
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontSize: 14,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        width: 130,
                      }}
                    >
                      Code
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        padding: "11px 14px",
                        color: "#7dd3f5",
                        borderBottom: "1px solid #2d3a50",
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontSize: 14,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        width: 120,
                      }}
                    >
                      Sequence
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredComboRows.map((row, idx) => (
                    <tr
                      key={`${row.id}-${row.teamCode}-${row.balls.join("-")}`}
                      style={{
                        background: idx % 2 === 0 ? "#111827" : "#0f172a",
                      }}
                    >
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid #1f2937", color: "#94a3b8" }}>
                        {row.id}
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid #1f2937" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            gap: 5,
                            alignItems: "center",
                            color: "#f5c842",
                            fontFamily: "'Barlow Condensed', sans-serif",
                            fontSize: 18,
                            fontWeight: 800,
                            letterSpacing: 1,
                          }}
                        >
                          {row.balls.map((ball) => String(ball).padStart(2, "0")).join(" - ")}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          borderBottom: "1px solid #1f2937",
                          color: row.teamCode === "REDRAW" ? "#ef4444" : "#e2e8f0",
                          fontWeight: 700,
                        }}
                      >
                        {row.team}
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid #1f2937", color: "#94a3b8" }}>
                        {row.teamCode}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          borderBottom: "1px solid #1f2937",
                          color: "#94a3b8",
                          textAlign: "right",
                        }}
                      >
                        {row.teamSequence ?? "—"}
                      </td>
                    </tr>
                  ))}

                  {filteredComboRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          padding: 28,
                          textAlign: "center",
                          color: "#94a3b8",
                          borderBottom: "1px solid #1f2937",
                        }}
                      >
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
import { useEffect, useMemo, useState } from "react";
import { DRAFT_YEAR } from "../lib/config";
import { parseProspectsCsv, prospectMatchesPositionFilter, type Prospect, type ProspectPositionFilter } from "../lib/prospects";

const PROSPECTS_CSV_PATH = "/mock/prospects.csv";

export default function ProspectRankingsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [status, setStatus] = useState("Loading prospects...");
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<ProspectPositionFilter>("all");

  useEffect(() => {
    fetch(PROSPECTS_CSV_PATH)
      .then((res) => {
        if (!res.ok) throw new Error("prospects.csv not found");
        return res.text();
      })
      .then((text) => {
        const parsed = parseProspectsCsv(text);
        setProspects(parsed);
        setStatus(`Loaded ${parsed.length} prospects.`);
      })
      .catch(() => setStatus("Could not load prospects.csv."));
  }, []);

  const filtered = useMemo(() => {
    const searchLower = search.trim().toLowerCase();

    return prospects.filter((p) => {
      const matchesSearch =
        !searchLower ||
        p.name.toLowerCase().includes(searchLower) ||
        p.pos.toLowerCase().includes(searchLower) ||
        p.league.toLowerCase().includes(searchLower) ||
        (p.team ?? "").toLowerCase().includes(searchLower);

      return matchesSearch && prospectMatchesPositionFilter(p, positionFilter);
    });
  }, [prospects, search, positionFilter]);

  return (
    <div className="container">
      <div className="page-title-frame">
        <h1 className="page-title">{DRAFT_YEAR} Prospect Rankings</h1>
      </div>
      <p style={{ textAlign: "center", color: "var(--color-text-muted)", marginBottom: "var(--space-2)" }}>
        Ranked board of {DRAFT_YEAR} NHL Draft-eligible prospects.
      </p>
      <p
        style={{
          textAlign: "center",
          color: "var(--color-text-muted)",
          fontSize: "var(--font-size-xs)",
          marginBottom: "var(--space-6)",
        }}
      >
        {status}
      </p>

      <div
        style={{
          display: "flex",
          gap: "var(--space-3)",
          maxWidth: 640,
          margin: "0 auto var(--space-6)",
        }}
      >
        <input
          className="form-input"
          placeholder="Search prospects"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="form-input"
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value as ProspectPositionFilter)}
          style={{ maxWidth: 200 }}
        >
          <option value="all">All Positions</option>
          <option value="centers">Centers</option>
          <option value="wingers">Wingers</option>
          <option value="forwards">Forwards</option>
          <option value="defense">Defense</option>
          <option value="goalies">Goalies</option>
        </select>
      </div>

      <div className="stat-table-scroll" style={{ paddingBottom: "var(--space-10)" }}>
        <table className="stat-table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>Rank</th>
              <th>Player</th>
              <th>Pos</th>
              <th>League</th>
              <th>Team</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.rank}>
                <td style={{ fontWeight: 800, color: "var(--color-purple)" }}>{p.rank}</td>
                <td style={{ fontWeight: 700 }}>{p.name}</td>
                <td>{p.pos}</td>
                <td>{p.league}</td>
                <td>{p.team ?? "-"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 28, textAlign: "center", color: "var(--color-text-muted)" }}>
                  No prospects match that search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

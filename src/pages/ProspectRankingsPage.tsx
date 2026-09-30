import { DRAFT_YEAR } from "../lib/config";

export default function ProspectRankingsPage() {
  return (
    <div className="container">
      <div className="page-title-frame">
        <h1 className="page-title">{DRAFT_YEAR} Prospect Rankings</h1>
      </div>
      <p style={{ textAlign: "center", color: "var(--color-text-muted)", paddingBottom: "var(--space-10)" }}>
        Coming soon - the full big board is being built out next.
      </p>
    </div>
  );
}

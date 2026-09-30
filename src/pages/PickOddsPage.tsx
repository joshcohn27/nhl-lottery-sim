import { DRAFT_YEAR } from "../lib/config";

export default function PickOddsPage() {
  return (
    <div className="container">
      <div className="page-title-frame">
        <h1 className="page-title">{DRAFT_YEAR} Draft Lottery Pick Odds</h1>
      </div>
      <p style={{ textAlign: "center", color: "var(--color-text-muted)", paddingBottom: "var(--space-10)" }}>
        Coming soon - a standalone odds table is being built out next. In the meantime, odds are shown live on the
        Lottery Sim page.
      </p>
    </div>
  );
}

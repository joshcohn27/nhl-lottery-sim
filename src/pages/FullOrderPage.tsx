import { DRAFT_YEAR } from "../lib/config";

export default function FullOrderPage() {
  return (
    <div className="container">
      <div className="page-title-frame">
        <h1 className="page-title">{DRAFT_YEAR} Full Draft Order</h1>
      </div>
      <p style={{ textAlign: "center", color: "var(--color-text-muted)", paddingBottom: "var(--space-10)" }}>
        Coming soon - a read-only view of the complete order is being built out next.
      </p>
    </div>
  );
}

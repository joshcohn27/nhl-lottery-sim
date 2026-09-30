import { NavLink } from "react-router-dom";

const NAV_TABS = [
  { to: "/", label: "Lottery Sim" },
  { to: "/draft", label: "Mock Draft" },
  { to: "/prospects", label: "Prospect Rankings" },
  { to: "/full-order", label: "Full Order" },
  { to: "/pick-odds", label: "Pick Odds" },
];

export function Header() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <NavLink to="/" className="site-wordmark">
          <img src="/favicon.svg" alt="" aria-hidden="true" />
          <span>NHL Mock Draft Simulator</span>
        </NavLink>

        <nav className="site-header-tabs" aria-label="Primary">
          {NAV_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === "/"}
              className={({ isActive }) => `site-header-tab${isActive ? " active" : ""}`}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}

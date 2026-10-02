import { useState } from "react";

const ADMIN_PASSWORD_STORAGE_KEY = "nhl-sim-admin-password";

type UpdateStatus = "idle" | "working" | "done" | "error";

export function Footer() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [message, setMessage] = useState("");

  async function triggerUpdate() {
    let password = localStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY);
    if (!password) {
      password = window.prompt("Admin password:");
      if (!password) return;
    }

    setStatus("working");
    setMessage("Triggering standings update...");

    try {
      const response = await fetch("/api/trigger-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (response.status === 401) {
        localStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
        setStatus("error");
        setMessage("Incorrect password.");
        return;
      }

      if (!response.ok) {
        setStatus("error");
        setMessage("Update failed - try again later.");
        return;
      }

      localStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, password);
      setStatus("done");
      setMessage("Update triggered - standings will refresh in about a minute.");
    } catch {
      setStatus("error");
      setMessage("Update failed - check your connection.");
    }
  }

  return (
    <footer className="site-footer">
      <div className="container">
        <div>
          Unofficial fan project. Not affiliated with or endorsed by the NHL or any club. Team names and logos are
          trademarks of their respective owners.
        </div>
        <div className="footer-admin">
          <button
            type="button"
            className="footer-admin-link"
            onClick={triggerUpdate}
            disabled={status === "working"}
          >
            Update standings
          </button>
          {message && <span className={`footer-admin-status footer-admin-status-${status}`}>{message}</span>}
        </div>
      </div>
    </footer>
  );
}

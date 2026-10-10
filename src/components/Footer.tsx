// Opens a new DM to the site's X account. X only accepts the numeric account
// ID here, not the @handle (this one is @MichkovsBurner).
const SUPPORT_DM_URL = "https://x.com/messages/compose?recipient_id=1288542088460673027";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div>
          Unofficial fan project. Not affiliated with or endorsed by the NHL or any club. Team names and logos are
          trademarks of their respective owners.
        </div>
        <div>
          Design inspired by{" "}
          <a href="https://www.tankathon.com/nhl" target="_blank" rel="noopener noreferrer">
            Tankathon
          </a>
          .
        </div>
        <div>
          Found a bug or have a question?{" "}
          <a href={SUPPORT_DM_URL} target="_blank" rel="noopener noreferrer">
            Contact support
          </a>
          .
        </div>
        <div className="site-version">v{__APP_VERSION__}</div>
      </div>
    </footer>
  );
}

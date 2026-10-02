// Vercel serverless function (Node runtime). Deployed and run by Vercel -
// not part of the Vite build or the src/ TypeScript project, so it's
// intentionally plain JS outside tsc/eslint's scope (both are configured to
// only look at src/).
//
// Lets the password-gated "Update standings" control in the site footer
// trigger the update-standings GitHub Actions workflow on demand. The
// GitHub token and admin password live only as Vercel environment
// variables - never shipped to the browser.

const OWNER = "joshcohn27";
const REPO = "nhl-lottery-sim";
const WORKFLOW_FILE = "update-standings.yml";
const REF = "master";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const expectedPassword = process.env.ADMIN_PASSWORD;
  const githubToken = process.env.GITHUB_DISPATCH_TOKEN;

  if (!expectedPassword || !githubToken) {
    res.status(500).json({ error: "Server not configured" });
    return;
  }

  const password = req.body?.password;
  if (typeof password !== "string" || password !== expectedPassword) {
    res.status(401).json({ error: "Incorrect password" });
    return;
  }

  const githubResponse = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: REF }),
    }
  );

  if (!githubResponse.ok) {
    const detail = await githubResponse.text();
    res.status(502).json({ error: `GitHub API error (${githubResponse.status}): ${detail}` });
    return;
  }

  res.status(200).json({ ok: true });
}

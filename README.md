# NHL Mock Draft Simulator

A fan-made simulator for the 2027 NHL Draft Lottery and first-round (and
second-round) mock draft, built with React 19, TypeScript, and Vite. Live at
[nhlmock.joshbcohn.com](https://nhlmock.joshbcohn.com).

Unofficial fan project. Not affiliated with or endorsed by the NHL or any
club. Team names and logos are trademarks of their respective owners.

## Pages

- **Lottery Sim** (`/`) - draws the two-ball NHL draft lottery live (manual
  ball-by-ball or instant sim), then flows into the mock draft.
- **Mock Draft** (`/draft`) - same flow as Lottery Sim; build a full
  first-round (and optional second-round) mock draft pick by pick, or
  auto-pick some/all of it.
- **Prospect Rankings** (`/prospects`) - searchable/filterable list of all
  draft-eligible prospects.
- **Full Order** (`/full-order`) - the complete projected draft order with
  all traded-pick conditions applied.
- **Pick Odds** (`/pick-odds`) - the exact (not simulated) lottery
  probability matrix for every lottery team/pick combination.

## How the lottery/draft logic works

- The 16-team lottery pool is whichever teams are **not** in a playoff spot
  "if the playoffs started today" (division top 3 + 2 wildcards per
  conference), recomputed from live standings - not just the bottom 16 by
  points.
- Standings ties are broken using the NHL's actual published procedure:
  points -> fewer games played -> regulation wins -> ROW -> total wins ->
  goal differential -> goals for.
- Picks 17-32 (and 49-64 in two-round mode) follow the real
  playoff-advancement order once playoff results exist: non-finalists by
  regular-season record, then conference-final losers, then the Stanley Cup
  Final loser and champion.
- Traded first- and second-round picks (including conditional/protected
  ones) are layered on top of the standings-derived order - see
  `public/data/pick-trades.json`.

## Data and how it stays fresh

- `public/data/standings.json` - live NHL standings, auto-updated by
  `scripts/update-standings.mjs`.
- `public/data/pick-trades.json` - traded-pick overlay rules for both
  rounds, sourced from Wikipedia/NHL.com/team press releases.
- `public/data/playoff-results.json` - playoff advancement results, once
  the postseason happens.
- `public/mock/prospects.csv` - draft-eligible prospect rankings.
- `public/mock/combos.csv` - the 1,001 four-ball lottery combinations and
  which lottery slot each resolves to.

Standings refresh automatically: `.github/workflows/update-standings.yml`
runs the updater on a cron targeted around actual NHL game windows (hourly
4pm-2am America/New_York, every 4 hours the rest of the day) and commits
`standings.json` back to the repo if it changed. It can also be run manually
from the repo's Actions tab.

The updater never overwrites a good `standings.json` with a bad one - on any
fetch failure, unexpected season, or implausible result, it leaves the
existing file alone.

## Development

```sh
npm install
npm run dev        # start the Vite dev server
npm run build      # typecheck + production build
npm run lint        # eslint
npm run test        # vitest
npm run update-standings  # run the standings updater locally
```

Deployment is via Vercel, auto-deploying from `master`.

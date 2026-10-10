# Changelog

Versions are `MAJOR.MINOR.PATCH`. The current version lives in
`package.json` and is shown in the site footer.

- **MAJOR** - a new draft year or a full redesign.
- **MINOR** - a new feature, page, or change in how the sim behaves.
- **PATCH** - a bug fix, styling tweak, wording change, or hand-edited data
  (prospects, traded picks).

Every code, logic, or styling change bumps the version and gets an entry
here. Automated standings updates (`chore: update standings`) do not.

Versions before 2.5.0 were assigned retroactively from the commit history.

## 2.6.0 - 2026-10-09
- Footer: "Contact support" link that opens an X direct message to the site's
  account.

## 2.5.1 - 2026-10-09
- Printable draft (Save Draft): each round now fits on exactly one Letter
  page, with long pick notes on their own line instead of wrapping.
- Printable draft shows both logos for a pick split between two teams.

## 2.5.0 - 2026-10-09
- Show the site version in the footer; add this changelog.

## 2.4.1 - 2026-10-09
- Fix the lottery standings table showing the wrong team beside each record
  after a drawing. Rows now keep their own team, and the table re-sorts into
  the final draft order with "Won pick" and "Up/Down" badges once the
  lottery is done.

## 2.4.0 - 2026-10-09
- Mock Draft now tells visitors to run the lottery first, with a step-1
  callout that updates once the lottery is done.
- Lottery Sim subtitle spells out the flow: sim the lottery, then mock draft.

## 2.3.2 - 2026-10-09
- Team logos render about 20% larger.

## 2.3.1 - 2026-10-09
- Correct the lottery win-limit note: one prior win leaves a team eligible;
  only a team already at two is blocked.

## 2.3.0 - 2026-10-09
- Public launch at hockeylotto.com.
- Remove the manual "Update standings" control and its backend.
- Credit Tankathon in the footer.
- Show Toronto's first-round pick as split between Philadelphia and Boston,
  with both logos.
- Move the lottery win-limit note below the standings and explain the rule.
- Mobile: wrap "Ball N" chips under the team name; fix the End of Lottery
  divider.

## 2.2.1 - 2026-10-03
- Fix 404 when refreshing or directly opening any page other than the home
  page.

## 2.2.0 - 2026-10-02
- Prospect names link to their Elite Prospects profile.

## 2.1.0 - 2026-10-01
- Password-gated "Update standings" control in the footer (removed in 2.3.0).

## 2.0.1 - 2026-10-01
- Draft board fits without scrolling; Draft button moved above Auto-Pick
  Next.
- Standings refresh schedule targeted around game times.

## 2.0.0 - 2026-09-30
- Move the sim to the 2027 NHL Draft.
- Automatic standings updates from the NHL.
- Lottery pool decided by playoff position; standings use the NHL's
  tiebreak procedure; picks 17-32 follow playoff results.
- Traded and conditional picks shown in both rounds.
- Tankathon-inspired redesign with team logos and a mobile menu.
- New pages: Prospect Rankings, Full Order, Pick Odds.

## 1.2.0 - 2026-06-23
- Post-lottery update for the 2026 draft: final draft order, updated
  prospects, lottery disabled.

## 1.1.0 - 2026-05-20
- Updated prospects and team order.

## 1.0.1 - 2026-05-10
- New title and favicon; draft board and lottery spacing fixes.

## 1.0.0 - 2026-05-07
- Initial release: 2026 NHL Draft Lottery simulator and mock draft.

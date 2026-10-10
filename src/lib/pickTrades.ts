export interface OverlayPick {
  team: string;
  pick: number;
  note: string;
}

export interface UnconditionalRule {
  type: "unconditional";
  from: string;
  to: string;
  source?: string;
}

/** A pick that's genuinely split between two possible recipients with no
 * way to resolve it from standings/lottery data (e.g. the owning team gets
 * to choose later) - both recipients are shown together, always. */
export interface MultiRecipientRule {
  type: "multiRecipient";
  from: string;
  to: [string, string];
  source?: string;
}

export interface ProtectedTopNRule {
  type: "protectedTopN";
  team: string;
  topN: number;
  transferTo: string;
  source?: string;
}

/** A pick that never stays with its own team: goes to one recipient outside
 * the top N, or to an as-yet-undetermined recipient (the owning team's own
 * choice) inside the top N. */
export interface SplitRecipientRule {
  type: "splitRecipient";
  team: string;
  topN: number;
  outsideTopNRecipient: string;
  insideTopNLabel: string;
  source?: string;
}

export interface NoteOnlyRule {
  type: "note";
  team: string;
  note: string;
  source?: string;
}

export type Round1Rule = UnconditionalRule | MultiRecipientRule | ProtectedTopNRule | SplitRecipientRule;
export type Round2Rule = UnconditionalRule | NoteOnlyRule;

/** Joins a multiRecipient rule's two team names into the single string a
 * pick's "team" field carries; TradedPickTeam splits on this to render both
 * recipients' logos. */
export const MULTI_RECIPIENT_SEPARATOR = "/";

function appendNote(existing: string, addition: string): string {
  return existing ? `${existing} ${addition}` : addition;
}

function ruleSourceTeam(rule: Round1Rule | Round2Rule): string {
  return rule.type === "unconditional" || rule.type === "multiRecipient" ? rule.from : rule.team;
}

/**
 * Applies round-1 trade rules to a base order that already reflects each
 * team's FINAL post-lottery pick slot (pick.pick). protectedTopN/splitRecipient
 * conditions are therefore evaluated against the actual resolved slot, not the
 * team's pre-lottery standings position.
 */
export function applyRound1Overlay<T extends OverlayPick>(baseOrder: T[], rules: Round1Rule[]): T[] {
  const rulesByTeam = new Map(rules.map((rule) => [ruleSourceTeam(rule), rule]));

  return baseOrder.map((pick) => {
    const rule = rulesByTeam.get(pick.team);
    if (!rule) return pick;

    if (rule.type === "unconditional") {
      return { ...pick, team: rule.to, note: appendNote(pick.note, `(via ${rule.from})`) };
    }

    if (rule.type === "multiRecipient") {
      return {
        ...pick,
        team: rule.to.join(MULTI_RECIPIENT_SEPARATOR),
        note: appendNote(pick.note, `(via ${rule.from})`),
      };
    }

    if (rule.type === "protectedTopN") {
      if (pick.pick <= rule.topN) return pick;
      return {
        ...pick,
        team: rule.transferTo,
        note: appendNote(pick.note, `(via ${rule.team}, protected top-${rule.topN})`),
      };
    }

    if (pick.pick <= rule.topN) {
      return { ...pick, team: rule.insideTopNLabel, note: appendNote(pick.note, `(protected top-${rule.topN})`) };
    }

    return {
      ...pick,
      team: rule.outsideTopNRecipient,
      note: appendNote(pick.note, `(via ${rule.team})`),
    };
  });
}

/**
 * Applies round-2 trade rules to the base order. A team can have more than
 * one rule attached to its own natural pick (e.g. an unconditional trade of
 * its own pick AND an unrelated informational note about a separate
 * conditional pick that happens to reference it) - all of a team's rules are
 * applied in order, not just the first/last one, so a real trade can never be
 * silently dropped in favor of an unrelated note (or vice versa).
 */
export function applyRound2Overlay<T extends OverlayPick>(baseOrder: T[], rules: Round2Rule[]): T[] {
  const rulesByTeam = new Map<string, Round2Rule[]>();
  for (const rule of rules) {
    const team = ruleSourceTeam(rule);
    const existing = rulesByTeam.get(team);
    if (existing) existing.push(rule);
    else rulesByTeam.set(team, [rule]);
  }

  return baseOrder.map((pick) => {
    const teamRules = rulesByTeam.get(pick.team);
    if (!teamRules) return pick;

    return teamRules.reduce((current, rule) => {
      if (rule.type === "unconditional") {
        return { ...current, team: rule.to, note: appendNote(current.note, `(via ${rule.from})`) };
      }

      return { ...current, note: appendNote(current.note, rule.note) };
    }, pick);
  });
}

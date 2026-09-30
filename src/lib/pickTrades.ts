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

export type Round1Rule = UnconditionalRule | ProtectedTopNRule | SplitRecipientRule;
export type Round2Rule = UnconditionalRule | NoteOnlyRule;

function appendNote(existing: string, addition: string): string {
  return existing ? `${existing} ${addition}` : addition;
}

function ruleSourceTeam(rule: Round1Rule | Round2Rule): string {
  return rule.type === "unconditional" ? rule.from : rule.team;
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

export function applyRound2Overlay<T extends OverlayPick>(baseOrder: T[], rules: Round2Rule[]): T[] {
  const rulesByTeam = new Map(rules.map((rule) => [ruleSourceTeam(rule), rule]));

  return baseOrder.map((pick) => {
    const rule = rulesByTeam.get(pick.team);
    if (!rule) return pick;

    if (rule.type === "unconditional") {
      return { ...pick, team: rule.to, note: appendNote(pick.note, `(via ${rule.from})`) };
    }

    return { ...pick, note: appendNote(pick.note, rule.note) };
  });
}

import { describe, expect, it } from "vitest";
import {
  applyRound1Overlay,
  applyRound2Overlay,
  type NoteOnlyRule,
  type ProtectedTopNRule,
  type Round1Rule,
  type SplitRecipientRule,
  type UnconditionalRule,
} from "../pickTrades";

function baseOrder() {
  return [
    { team: "Vancouver", pick: 1, note: "" },
    { team: "Colorado", pick: 5, note: "" },
    { team: "Toronto", pick: 8, note: "" },
    { team: "Chicago", pick: 12, note: "" },
  ];
}

describe("applyRound1Overlay", () => {
  it("applies an unconditional transfer regardless of pick slot (Florida -> Chicago style)", () => {
    const rule: UnconditionalRule = { type: "unconditional", from: "Vancouver", to: "Boston" };
    const result = applyRound1Overlay(baseOrder(), [rule]);

    expect(result[0]).toEqual({ team: "Boston", pick: 1, note: "(via Vancouver)" });
  });

  it("keeps the pick with the protecting team when inside the protected range", () => {
    const rule: ProtectedTopNRule = { type: "protectedTopN", team: "Colorado", topN: 10, transferTo: "Toronto" };
    const result = applyRound1Overlay(baseOrder(), [rule]);

    expect(result[1]).toEqual({ team: "Colorado", pick: 5, note: "" });
  });

  it("transfers the pick when outside the protected range, checked against the FINAL slot", () => {
    const rule: ProtectedTopNRule = { type: "protectedTopN", team: "Toronto", topN: 5, transferTo: "Philadelphia" };
    const result = applyRound1Overlay(baseOrder(), [rule]);

    expect(result[2].team).toBe("Philadelphia");
    expect(result[2].note).toContain("via Toronto");
    expect(result[2].note).toContain("protected top-5");
  });

  it("a team just inside the boundary (pick === topN) is still protected", () => {
    const rule: ProtectedTopNRule = { type: "protectedTopN", team: "Colorado", topN: 5, transferTo: "Toronto" };
    const result = applyRound1Overlay(baseOrder(), [rule]);

    expect(result[1].team).toBe("Colorado");
  });

  it("splitRecipient sends the pick to the outside-top-N recipient when outside range", () => {
    const rule: SplitRecipientRule = {
      type: "splitRecipient",
      team: "Chicago",
      topN: 10,
      outsideTopNRecipient: "Philadelphia",
      insideTopNLabel: "Chicago (pending: Boston or Philadelphia)",
    };
    const result = applyRound1Overlay(baseOrder(), [rule]);

    expect(result[3].team).toBe("Philadelphia");
  });

  it("splitRecipient shows the pending label when inside the range", () => {
    const rule: SplitRecipientRule = {
      type: "splitRecipient",
      team: "Toronto",
      topN: 10,
      outsideTopNRecipient: "Philadelphia",
      insideTopNLabel: "Toronto (pending: Boston or Philadelphia)",
    };
    const result = applyRound1Overlay(baseOrder(), [rule]);

    expect(result[2].team).toBe("Toronto (pending: Boston or Philadelphia)");
  });

  it("leaves picks with no matching rule untouched", () => {
    const rules: Round1Rule[] = [{ type: "unconditional", from: "Vancouver", to: "Boston" }];
    const result = applyRound1Overlay(baseOrder(), rules);

    expect(result[1]).toEqual({ team: "Colorado", pick: 5, note: "" });
    expect(result[3]).toEqual({ team: "Chicago", pick: 12, note: "" });
  });
});

describe("applyRound2Overlay", () => {
  it("applies an unconditional transfer", () => {
    const rule: UnconditionalRule = { type: "unconditional", from: "Boston", to: "NY Rangers" };
    const result = applyRound2Overlay([{ team: "Boston", pick: 38, note: "" }], [rule]);

    expect(result[0]).toEqual({ team: "NY Rangers", pick: 38, note: "(via Boston)" });
  });

  it("a note-only rule keeps the team but appends the note", () => {
    const rule: NoteOnlyRule = {
      type: "note",
      team: "Colorado",
      note: "(pending: Calgary may receive this pick if better than Minnesota's)",
    };
    const result = applyRound2Overlay([{ team: "Colorado", pick: 40, note: "" }], [rule]);

    expect(result[0].team).toBe("Colorado");
    expect(result[0].note).toBe("(pending: Calgary may receive this pick if better than Minnesota's)");
  });

  it("applies BOTH rules when a team has an unconditional trade of its own pick AND an unrelated note (regression: Columbus/Winnipeg/Minnesota each have a real trade plus a separate pending-swap note, and the real trade must not be silently dropped)", () => {
    const unconditional: UnconditionalRule = { type: "unconditional", from: "Columbus", to: "Seattle" };
    const note: NoteOnlyRule = {
      type: "note",
      team: "Columbus",
      note: "(pending: Florida receives the better / Columbus receives the lower of Columbus's or Winnipeg's pick)",
    };

    const result = applyRound2Overlay([{ team: "Columbus", pick: 34, note: "" }], [unconditional, note]);

    expect(result[0].team).toBe("Seattle");
    expect(result[0].note).toContain("via Columbus");
    expect(result[0].note).toContain("pending: Florida receives the better");
  });

  it("applies multiple rules for the same team regardless of which order they appear in the rules array", () => {
    const note: NoteOnlyRule = { type: "note", team: "Winnipeg", note: "(some pending note)" };
    const unconditional: UnconditionalRule = { type: "unconditional", from: "Winnipeg", to: "Seattle" };

    // note listed BEFORE the unconditional rule this time
    const result = applyRound2Overlay([{ team: "Winnipeg", pick: 46, note: "" }], [note, unconditional]);

    expect(result[0].team).toBe("Seattle");
    expect(result[0].note).toContain("via Winnipeg");
    expect(result[0].note).toContain("some pending note");
  });
});

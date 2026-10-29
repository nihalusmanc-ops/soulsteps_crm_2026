import { it, expect } from "vitest";
import { reviewSamples } from "../src/shared/review-samples";
import {
  applyCommand,
  commandSchema,
  confirmationBlock,
} from "../src/shared/domain";
import {
  callingList,
  leadColour,
  compareCalling,
  currentNote,
} from "../src/shared/calling";
import { defaultRules, evaluateRules } from "../src/shared/management";
import { previewWrite, rollbackWrite } from "../src/web/data/optimistic";
const samples = () => reviewSamples("NORWAY", "STAFF");
const context = { actor: "Test staff", demo: false };
it("uses the approved six priorities and treats friends as family/small group", () => {
  expect(
    samples()
      .slice(1, 7)
      .map((e) => evaluateRules(defaultRules, e.group, e.visa).rank),
  ).toEqual(["P1", "P2", "P3", "P4", "P5", "P6"]);
  expect(evaluateRules(defaultRules, "friends", "all").rank).toBe("P4");
  expect(evaluateRules(defaultRules, "friends", "none").rank).toBe("P6");
  const updated = defaultRules.map((r) =>
    r.group === "family" && r.visa === "all"
      ? { ...r, rank: "P2" as const }
      : r,
  );
  expect(evaluateRules(updated, "friends", "all").rank).toBe("P2");
  expect(evaluateRules([], "couple", "all").rank).toBeNull();
});
it("puts qualification first and sorts follow-ups by colour", () => {
  const rows = samples();
  expect(
    rows
      .slice(0, 8)
      .reverse()
      .sort((a, b) => compareCalling(a, b, false))
      .map((e) => e.rank),
  ).toEqual([null, "P1", "P2", "P3", "P4", "P4", "P5", "P6"]);
  expect(
    rows
      .filter((e) => callingList(e) === "followups")
      .reverse()
      .sort((a, b) => compareCalling(a, b, true))
      .map(leadColour),
  ).toEqual(["orange", "yellow", "purple", "pink", "cyan", "blue"]);
});
it("atomically records the initial call, current note and optional follow-up without inventing a date", () => {
  const before = samples()[1];
  const after = applyCommand(
    before,
    { type: "saveCall", colour: "cyan", note: "No answer; try later." },
    "review",
    context,
  );
  expect(callingList(before)).toBe("new");
  expect(callingList(after)).toBe("followups");
  expect(after.initialCallAt).toBeTruthy();
  expect(after.tasks).toEqual([]);
  expect(after.activities.map((a) => a.type)).toEqual(["note", "call"]);
  const again = applyCommand(
    after,
    {
      type: "saveCall",
      colour: "orange",
      note: "Very interested now.",
      followup: "2026-11-02T06:00:00Z",
    },
    "review",
    context,
  );
  expect(again.initialCallAt).toBe(after.initialCallAt);
  expect(currentNote(again)).toBe("Very interested now.");
  expect(again.activities.some((a) => a.text === "No answer; try later.")).toBe(
    true,
  );
  expect(again.tasks[0].due).toBe("2026-11-02T06:00:00.000Z");
});
it("keeps colours manual, closes red, and rejects green without payment", () => {
  let e = samples()[1];
  for (let i = 0; i < 3; i++)
    e = applyCommand(
      e,
      { type: "saveCall", colour: "cyan", note: "No answer" },
      "review",
      context,
    );
  expect(leadColour(e)).toBe("cyan");
  expect(
    commandSchema.safeParse({
      type: "saveCall",
      colour: "green",
      note: "Pretend deposit",
    }).success,
  ).toBe(false);
  e = applyCommand(
    e,
    { type: "saveCall", colour: "red", note: "Not interested" },
    "review",
    context,
  );
  expect(callingList(e)).toBe("closed");
  expect(() =>
    applyCommand(
      e,
      { type: "saveCall", colour: "red", note: "Closed", followup: "bad" },
      "review",
      context,
    ),
  ).toThrow();
});
it("turns green on a recorded deposit while preserving the separate booking guard", () => {
  let e = samples()[1];
  e = applyCommand(
    e,
    { type: "quote", total: 100000, deposit: 20000, terms: "Agreed terms" },
    "review",
    context,
  );
  e = applyCommand(
    e,
    {
      type: "payment",
      amount: 20000,
      date: new Date().toISOString(),
      reference: "Test deposit",
    },
    "review",
    context,
  );
  expect(leadColour(e)).toBe("green");
  expect(callingList(e)).toBe("closed");
  expect(e.booking).toBeUndefined();
  expect(confirmationBlock(e)).toContain("unverified");
});
it("optimistically moves a first call and restores it on failure", () => {
  const before = { version: 1 as const, trips: [], enquiries: [samples()[1]] };
  const e = before.enquiries[0];
  const write = {
    kind: "command" as const,
    id: e.id,
    revision: e.revision,
    command: {
      type: "saveCall" as const,
      colour: "pink" as const,
      note: "Busy; call again",
    },
  };
  const preview = previewWrite(before, write, {
    id: "STAFF",
    name: "Staff",
    role: "staff",
    local: false,
  })!;
  expect(callingList(preview.enquiries[0])).toBe("followups");
  expect(rollbackWrite(preview, before, write)).toEqual(before);
});

import { it, expect } from "vitest";
import { seed } from "../src/shared/seed";
import {
  previewWrite,
  rollbackWrite,
  type CrmWrite,
} from "../src/web/data/optimistic";
import type { Command } from "../src/shared/domain";
const actor = {
  id: "STAFF",
  name: "Test staff",
  role: "staff" as const,
  local: false,
};
it("previews a note immediately without modifying the saved snapshot or other enquiries", () => {
  const state = seed(),
    e = state.enquiries[0];
  const before = structuredClone(state);
  const write: CrmWrite = {
    kind: "command",
    id: e.id,
    revision: e.revision,
    command: { type: "note", text: "New test note" },
  };
  const preview = previewWrite(state, write, actor)!;
  expect(preview.enquiries[0].activities[0]).toMatchObject({
    text: "New test note",
    actor: "Test staff",
  });
  expect(preview.enquiries[0].revision).toBe(e.revision + 1);
  expect(state).toEqual(before);
  const concurrent = {
    ...preview,
    enquiries: preview.enquiries.map((v, i) =>
      i === 1 ? { ...v, holdReason: "Another record changed" } : v,
    ),
  };
  const restored = rollbackWrite(concurrent, state, write);
  expect(restored.enquiries[0]).toEqual(e);
  expect(restored.enquiries[1].holdReason).toBe("Another record changed");
});
it("updates shared customer contact details but waits for authoritative trip-fit rules", () => {
  const state = seed(),
    e = state.enquiries[0];
  state.enquiries[1].customerId = e.customerId;
  const write: CrmWrite = {
    kind: "command",
    id: e.id,
    revision: e.revision,
    command: {
      type: "qualify",
      group: "family",
      visa: "some",
      temperature: "warm",
      availability: "pending",
      name: "Updated customer",
      phone: "+971500000001",
    },
  };
  const preview = previewWrite(state, write, actor)!;
  expect(preview.enquiries.slice(0, 2).map((e) => e.name)).toEqual([
    "Updated customer",
    "Updated customer",
  ]);
  expect(preview.enquiries[0].rank).toBe(e.rank);
  expect(rollbackWrite(preview, state, write)).toEqual(state);
});
it("never previews payments, verification, booking, quotations or reviewed overrides", () => {
  const state = seed(),
    e = state.enquiries[0];
  const commands: Command[] = [
    {
      type: "payment",
      amount: 100,
      date: new Date().toISOString(),
      reference: "test",
    },
    { type: "verify", paymentId: "test" },
    { type: "reverse", paymentId: "test", reason: "test" },
    { type: "confirm" },
    { type: "quote", total: 100, deposit: 50, terms: "test" },
    { type: "override", rank: "P1", reason: "test" },
  ];
  for (const command of commands)
    expect(
      previewWrite(
        state,
        { kind: "command", id: e.id, revision: e.revision, command },
        actor,
      ),
    ).toBeNull();
});
it("previews trip content edits but keeps amount changes server-confirmed", () => {
  const state = seed(),
    trip = { ...state.trips[0], name: "Updated journey" };
  const write: CrmWrite = { kind: "trip", trip };
  const preview = previewWrite(state, write, actor)!;
  expect(preview.trips[0].name).toBe("Updated journey");
  expect(rollbackWrite(preview, state, write)).toEqual(state);
  expect(
    previewWrite(
      state,
      { kind: "trip", trip: { ...trip, price: 1000 } },
      actor,
    ),
  ).toBeNull();
});
it("rejects stale projections and invalid confirmed-stage shortcuts", () => {
  const state = seed(),
    e = state.enquiries[0];
  expect(() =>
    previewWrite(
      state,
      {
        kind: "command",
        id: e.id,
        revision: 99,
        command: { type: "note", text: "test" },
      },
      actor,
    ),
  ).toThrow(/changed/);
  expect(() =>
    previewWrite(
      state,
      {
        kind: "command",
        id: e.id,
        revision: e.revision,
        command: { type: "stage", stage: "CONFIRMED", reason: "test" },
      },
      actor,
    ),
  ).toThrow(/verified-deposit/);
});

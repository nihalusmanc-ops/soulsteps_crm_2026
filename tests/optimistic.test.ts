import { it, expect } from "vitest";
import { seed } from "../src/shared/seed";
import {
  previewWrite,
  rollbackWrite,
  type CrmWrite,
} from "../src/web/data/optimistic";
import type { Command } from "../src/shared/domain";
import { applyCommand, verifiedTotal } from "../src/shared/domain";
import { defaultRules } from "../src/shared/management";
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
it("updates shared contacts and uses active reviewed trip-fit rules immediately", () => {
  const state = seed(),
    e = state.enquiries[0];
  state.enquiries[1].customerId = e.customerId;
  e.stage = "QUALIFYING";
  delete e.override;
  const trip = state.trips.find((t) => t.id === e.tripId)!;
  trip.activeRules = structuredClone(defaultRules);
  trip.activeRuleVersion = 3;
  const write: CrmWrite = {
    kind: "command",
    id: e.id,
    revision: e.revision,
    command: {
      type: "qualify",
      group: "family",
      visa: "all",
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
  expect(preview.enquiries[0].rank).toBe("P4");
  expect(preview.enquiries[0].rankRuleVersion).toBe(3);
  expect(rollbackWrite(preview, state, write)).toEqual(state);
});
it("never previews fund verification, reversals or booking confirmation", () => {
  const state = seed(),
    e = state.enquiries[0];
  const commands: Command[] = [
    { type: "verify", paymentId: "test" },
    { type: "reverse", paymentId: "test", reason: "test" },
    { type: "confirm" },
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
it("previews new payments as unverified without changing verified funds or bookings, and rolls them back", () => {
  const state = seed();
  state.enquiries[0] = applyCommand(
    state.enquiries[0],
    { type: "quote", total: 100000, deposit: 20000, terms: "Test terms" },
    "review",
    { actor: actor.name, demo: false },
  );
  const e = state.enquiries[0],
    write: CrmWrite = {
      kind: "command",
      id: e.id,
      revision: e.revision,
      command: {
        type: "payment",
        amount: 20000,
        date: new Date().toISOString(),
        reference: "TEST-REF",
      },
    };
  const preview = previewWrite(state, write, actor)!;
  expect(preview.enquiries[0].payments.at(-1)).toMatchObject({
    reference: "TEST-REF",
    status: "pending",
  });
  expect(verifiedTotal(preview.enquiries[0])).toBe(verifiedTotal(e));
  expect(preview.enquiries[0].booking).toEqual(e.booking);
  expect(rollbackWrite(preview, state, write)).toEqual(state);
});
it("previews draft trip amounts and content without publishing or changing existing quotes", () => {
  const state = seed(),
    trip = { ...state.trips[0], name: "Updated journey" };
  const write: CrmWrite = { kind: "trip", trip };
  const preview = previewWrite(state, write, actor)!;
  expect(preview.trips[0].name).toBe("Updated journey");
  expect(rollbackWrite(preview, state, write)).toEqual(state);
  const amounts = previewWrite(
    state,
    { kind: "trip", trip: { ...trip, price: 100000, deposit: 20000 } },
    actor,
  )!;
  expect(amounts.trips[0]).toMatchObject({
    price: 100000,
    deposit: 20000,
    status: "draft",
  });
  expect(amounts.enquiries).toEqual(state.enquiries);
  expect(rollbackWrite(amounts, state, write)).toEqual(state);
});
it("previews quotations and manual priorities and restores them on failure", () => {
  const state = seed(),
    e = state.enquiries.find((e) => !e.quote)!;
  for (const command of [
    { type: "quote", total: 100000, deposit: 20000, terms: "Agreed terms" },
    { type: "override", rank: "P1", reason: "Reviewed by staff" },
  ] satisfies Command[]) {
    const write: CrmWrite = {
      kind: "command",
      id: e.id,
      revision: e.revision,
      command,
    };
    const preview = previewWrite(state, write, actor)!;
    const changed = preview.enquiries.find((value) => value.id === e.id)!;
    if (command.type === "quote")
      expect(changed.quote?.terms).toBe("Agreed terms");
    else expect(changed.override?.rank).toBe("P1");
    expect(rollbackWrite(preview, state, write)).toEqual(state);
  }
});
it("removes confirmed deletions immediately, restoring only the affected record on failure", () => {
  const state = seed(),
    e = state.enquiries[0];
  e.payments = [];
  delete e.booking;
  const manager = { ...actor, role: "manager" as const };
  const write: CrmWrite = {
    kind: "delete",
    resource: "enquiry",
    id: e.id,
    revision: e.revision,
  };
  const preview = previewWrite(state, write, manager)!;
  expect(preview.enquiries.some((value) => value.id === e.id)).toBe(false);
  expect(rollbackWrite(preview, state, write)).toEqual(state);
  preview.enquiries[0] = {
    ...preview.enquiries[0],
    currentNote: "Unrelated update",
  };
  expect(rollbackWrite(preview, state, write).enquiries[1].currentNote).toBe(
    "Unrelated update",
  );
  expect(() => previewWrite(state, write, actor)).toThrow(/manager/);
  e.payments = [
    {
      id: "P",
      amount: 10,
      currency: "AED",
      date: new Date().toISOString(),
      reference: "Test",
      status: "pending",
    },
  ];
  expect(() => previewWrite(state, write, manager)).toThrow(
    /financial history/,
  );
  const trip = state.trips.find((t) => t.id === e.tripId)!;
  expect(() =>
    previewWrite(
      state,
      { kind: "delete", resource: "trip", id: trip.id, revision: trip.version },
      manager,
    ),
  ).toThrow(/linked enquiries/);
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

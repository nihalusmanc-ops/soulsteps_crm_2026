import { afterEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { CallingWrites } from "../src/web/data/use-calling-writes";
import { apiRepository, ApiRequestError } from "../src/web/data/api";
import { localDue } from "../src/shared/calling";
import { reviewSamples } from "../src/shared/review-samples";
import { defaultRules } from "../src/shared/management";
import { applyCommand, type State, type Command } from "../src/shared/domain";
const actor = {
  id: "STAFF",
  name: "Test staff",
  role: "staff" as const,
  local: false,
};
const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
function setup() {
  const client = new QueryClient();
  const state: State = {
    version: 1,
    trips: [
      {
        id: "NORWAY",
        name: "Norway",
        destination: "Norway",
        status: "draft",
        description: "",
        type: "fixed",
        departure: "",
        availabilityNote: "",
        itinerary: "",
        price: null,
        deposit: null,
        version: 1,
        groupVisaPolicy: "review",
        activeRules: defaultRules,
      },
    ],
    enquiries: reviewSamples("NORWAY", "STAFF"),
  };
  client.setQueryData(["crm", actor.id], state);
  vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const store = new CallingWrites(client, actor, () => false);
  const read = (index: number) =>
    client.getQueryData<State>(["crm", actor.id])!.enquiries[index];
  return { client, state, store, read };
}
afterEach(() => vi.restoreAllMocks());
it("previews rapid same-row changes, sends them in revision order, and lets another row save independently", async () => {
  const { store, read } = setup();
  const hold = gate();
  const sent: { id: string; revision: number; command: Command }[] = [];
  vi.spyOn(apiRepository, "command").mockImplementation(
    async (id, revision, command) => {
      sent.push({ id, revision, command });
      if (id === read(1).id && sent.length === 1) await hold.promise;
    },
  );
  const first = store.command(read(1).id, {
    type: "callColour",
    colour: "orange",
  });
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  const second = store.command(read(1).id, {
    type: "callColour",
    colour: "cyan",
  });
  const other = store.command(read(2).id, {
    type: "override",
    rank: "P1",
    reason: "Staff selection",
  });
  await vi.waitFor(() => expect(read(1).callColour).toBe("cyan"));
  expect(await other).toBe(true);
  expect(read(2).rank).toBe("P1");
  expect(sent.filter((s) => s.id === read(1).id)).toHaveLength(1);
  hold.release();
  expect(await first).toBe(true);
  expect(await second).toBe(true);
  expect(
    sent.filter((s) => s.id === read(1).id).map((s) => s.revision),
  ).toEqual([0, 1]);
  expect(read(1).initialCallAt).toBeUndefined();
  store.dispose();
});
it("rolls back only the failed row and retries its exact write before queued edits", async () => {
  const { store, read } = setup();
  const hold = gate();
  let fail = true;
  const sent: any[] = [];
  vi.spyOn(apiRepository, "command").mockImplementation(
    async (id, revision, command) => {
      sent.push({ id, revision, command });
      if (id === read(1).id && fail) {
        await hold.promise;
        throw new TypeError("Connection interrupted");
      }
    },
  );
  const first = store.command(read(1).id, {
    type: "callColour",
    colour: "orange",
  });
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  const second = store.command(read(1).id, {
    type: "callColour",
    colour: "blue",
  });
  const other = store.command(read(2).id, {
    type: "callColour",
    colour: "pink",
  });
  await other;
  hold.release();
  expect(await first).toBe(false);
  expect(await second).toBe(false);
  expect(read(1).callColour).toBeUndefined();
  expect(read(2).callColour).toBe("pink");
  fail = false;
  await store.retry(read(1).id);
  expect(sent[0]).toEqual(sent[2]);
  expect(read(1).callColour).toBe("blue");
  expect(store.failures).toHaveLength(0);
  store.dispose();
});
it("replays a lost response without applying the committed command twice", async () => {
  const { client, store, read } = setup();
  let fail = true;
  const command = { type: "callColour", colour: "orange" } as const;
  vi.spyOn(apiRepository, "command").mockImplementation(async () => {
    if (fail) throw new TypeError("Response lost");
  });
  await store.command(read(1).id, command);
  const committed = applyCommand(read(1), command, "review", {
    actor: actor.name,
    demo: false,
  });
  client.setQueryData<State>(["crm", actor.id], (state) => ({
    ...state!,
    enquiries: state!.enquiries.map((e) =>
      e.id === committed.id ? committed : e,
    ),
  }));
  fail = false;
  await store.retry(committed.id);
  expect(read(1).revision).toBe(1);
  expect(
    read(1).activities.filter((a) => a.text.includes("Call colour")),
  ).toHaveLength(1);
  store.dispose();
});
it("keeps a draft when another staff member changes its saved value", async () => {
  const { store, read, client } = setup();
  store.edit(read(1).id, "note", "My draft", "");
  const original = read(1);
  client.setQueryData<State>(["crm", actor.id], (state) => ({
    ...state!,
    enquiries: state!.enquiries.map((e) =>
      e.id === original.id
        ? { ...e, currentNote: "Colleague's note", revision: 1 }
        : e,
    ),
  }));
  const send = vi.spyOn(apiRepository, "command").mockResolvedValue();
  await store.flushDraft(original.id, "note");
  expect(send).not.toHaveBeenCalled();
  expect(store.conflict(original.id, "note", "Colleague's note")).toBe(true);
  expect(store.draft(original.id, "note")?.value).toBe("My draft");
  store.dispose();
});
it("an explicit retry of a rejected revision refreshes and preserves the user's newer draft", async () => {
  const { store, read, state } = setup();
  let fail = true;
  const calls: number[] = [];
  vi.spyOn(apiRepository, "command").mockImplementation(
    async (_id, revision) => {
      calls.push(revision);
      if (fail)
        throw new ApiRequestError(
          "This enquiry changed",
          409,
          "REVISION_CONFLICT",
        );
    },
  );
  await store.command(read(1).id, { type: "setNote", text: "Original edit" });
  store.edit(read(1).id, "note", "Newer unfinished edit", "");
  const fresh = structuredClone(state);
  fresh.enquiries[1].currentNote = "Colleague edit";
  fresh.enquiries[1].revision = 1;
  vi.spyOn(apiRepository, "read").mockResolvedValue(fresh);
  fail = false;
  await store.retry(read(1).id);
  await vi.waitFor(() =>
    expect(read(1).currentNote).toBe("Newer unfinished edit"),
  );
  expect(calls).toEqual([0, 1, 2]);
  store.dispose();
});
it("preserves note whitespace during autosave and requires a committed date clear", async () => {
  const { store, read } = setup();
  const send = vi.spyOn(apiRepository, "command").mockResolvedValue();
  store.edit(
    read(8).id,
    "note",
    "A sentence followed by a space ",
    read(8).currentNote!,
  );
  await store.flushDraft(read(8).id, "note");
  expect(read(8).currentNote).toBe("A sentence followed by a space ");
  send.mockClear();
  store.edit(read(8).id, "due", "", localDue(read(8).tasks[0].due));
  await store.flushDraft(read(8).id, "due");
  expect(send).not.toHaveBeenCalled();
  store.commitDue(read(8).id);
  await vi.waitFor(() => expect(send).toHaveBeenCalled());
  expect(read(8).tasks.filter((t) => t.status === "pending")).toHaveLength(0);
  store.dispose();
});

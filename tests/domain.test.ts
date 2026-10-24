import { describe, it, expect } from "vitest";
import { seed } from "../src/web/data/repository";
import {
  applyCommand,
  classify,
  confirmationBlock,
  verifiedTotal,
  dubaiDay,
} from "../src/shared/domain";
describe("trip fit is independent of intent", () => {
  it.each([
    ["couple", "all", "P1"],
    ["couple", "none", "P2"],
    ["solo", "all", "P4"],
    ["solo", "none", "P5"],
    ["friends", "none", "P6"],
  ] as const)("%s / %s ? %s", (group, visa, rank) =>
    expect(classify(group, visa).rank).toBe(rank),
  );
  it("leaves overlapping, mixed and unknown cases unresolved", () => {
    expect(classify("family", "all").rank).toBeNull();
    expect(classify("couple", "some").rank).toBeNull();
    expect(classify("solo", "unknown").rank).toBeNull();
  });
  it("preserves explicit override during qualification changes", () => {
    let e = seed().enquiries[0];
    e = applyCommand(e, {
      type: "override",
      rank: "P6",
      reason: "Reviewed special requirements",
    });
    e = applyCommand(e, {
      type: "qualify",
      group: "solo",
      visa: "none",
      temperature: "hot",
      availability: "pending",
    });
    expect(e.rank).toBe("P6");
    expect(e.temperature).toBe("hot");
  });
});
describe("financial invariants", () => {
  it("blocks partial deposit", () => {
    const e = seed().enquiries[4];
    expect(confirmationBlock(e)).toContain("remains unverified");
    expect(() => applyCommand(e, { type: "confirm" })).toThrow();
  });
  it("recording payment does not verify it", () => {
    const e = applyCommand(seed().enquiries[4], {
      type: "payment",
      amount: 200000,
      date: new Date().toISOString(),
      reference: "fictional",
    });
    expect(verifiedTotal(e)).toBe(100000);
    expect(() => applyCommand(e, { type: "confirm" })).toThrow();
  });
  it("verification requires separate explicit confirmation and retains balance", () => {
    let e = applyCommand(seed().enquiries[4], {
      type: "payment",
      amount: 200000,
      date: new Date().toISOString(),
      reference: "fictional",
    });
    e = applyCommand(e, { type: "verify", paymentId: e.payments[1].id });
    expect(e.booking).toBeUndefined();
    e = applyCommand(e, { type: "confirm" });
    expect(e.stage).toBe("CONFIRMED");
    expect(e.quote!.total - verifiedTotal(e)).toBe(900000);
    expect(applyCommand(e, { type: "confirm" })).toEqual(e);
  });
  it("rejects missing terms and zero deposit", () => {
    const e = seed().enquiries[11];
    e.quote!.deposit = null;
    expect(() => applyCommand(e, { type: "confirm" })).toThrow();
    e.quote!.deposit = 0;
    expect(() => applyCommand(e, { type: "confirm" })).toThrow();
  });
  it("blocks overpayments and direct confirmed stage", () => {
    const e = seed().enquiries[11];
    e.payments[0].amount = 1500000;
    expect(confirmationBlock(e)).toContain("Overpayment");
    expect(() =>
      applyCommand(e, { type: "stage", stage: "CONFIRMED", reason: "" }),
    ).toThrow();
  });
  it("uses audited reversals and immutable issued quotes", () => {
    const e = seed().enquiries[11];
    const next = applyCommand(e, {
      type: "reverse",
      paymentId: e.payments[0].id,
      reason: "Duplicate fictional bank entry",
    });
    expect(verifiedTotal(next)).toBe(0);
    expect(next.payments).toHaveLength(1);
    expect(next.activities[0].text).toContain("Duplicate");
    expect(() =>
      applyCommand(e, {
        type: "quote",
        total: 500,
        deposit: 200,
        terms: "changed",
      }),
    ).toThrow();
  });
});
describe("daily workflow", () => {
  it("logs no answer without losing the enquiry and completes linked task", () => {
    const e = seed().enquiries[1];
    const next = applyCommand(e, {
      type: "call",
      outcome: "No answer",
      note: "Try tomorrow",
      taskId: e.tasks[0].id,
      followup: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(next.stage).toBe(e.stage);
    expect(next.response).toBe("no_answer");
    expect(next.tasks[0].status).toBe("completed");
    expect(next.tasks[1].status).toBe("pending");
    expect(next.activities.length).toBeGreaterThan(e.activities.length);
  });
  it("requires followup or explicit no-action reason", () =>
    expect(() =>
      applyCommand(seed().enquiries[0], {
        type: "call",
        outcome: "Connected",
        note: "",
      }),
    ).toThrow());
  it("reschedules without overwriting old history", () => {
    const e = seed().enquiries[1];
    const due = e.tasks[0].due;
    const next = applyCommand(e, {
      type: "task",
      due: new Date().toISOString(),
      kind: "Callback",
      note: "Agreed",
      replaces: e.tasks[0].id,
    });
    expect(next.tasks[0].due).toBe(due);
    expect(next.tasks[0].status).toBe("cancelled");
    expect(next.tasks).toHaveLength(2);
  });
  it("requires closure reason and cancels pending tasks on hold", () => {
    const e = seed().enquiries[1];
    expect(() =>
      applyCommand(e, { type: "stage", stage: "LOST", reason: "" }),
    ).toThrow();
    expect(
      applyCommand(e, {
        type: "stage",
        stage: "ON_HOLD",
        reason: "Future travel",
      }).tasks[0].status,
    ).toBe("cancelled");
  });
  it("uses Dubai calendar boundaries", () => {
    expect(dubaiDay(new Date("2026-10-23T19:59:00Z"))).toBe("2026-10-23");
    expect(dubaiDay(new Date("2026-10-23T20:00:00Z"))).toBe("2026-10-24");
  });
});
import { manualWhatsAppUrl } from "../src/shared/domain";
import { app } from "../src/server/index";
describe("manual contacts and closed API boundary", () => {
  it("never constructs a link from partial or absent phones", () => {
    expect(manualWhatsAppUrl(null)).toBeNull();
    expect(manualWhatsAppUrl("971xxx")).toBeNull();
    expect(manualWhatsAppUrl("+12")).toBeNull();
    expect(manualWhatsAppUrl("+12025550123")).toBe("https://wa.me/12025550123");
  });
  it("fails closed when staff identity configuration is missing", async () => {
    const response = await app.request(
      "/api/enquiries",
      {},
      { APP_ENV: "production" },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

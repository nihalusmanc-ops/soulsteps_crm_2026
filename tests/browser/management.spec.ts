import { test, expect, type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";
const origin = "http://127.0.0.1:8791",
  headers = { Origin: origin, "X-Soulsteps-Request": "1" };
const post = (
  r: APIRequestContext,
  path: string,
  data: unknown = {},
  key = crypto.randomUUID(),
) =>
  r.post("/api" + path, {
    headers: { ...headers, "Idempotency-Key": key },
    data,
  });
async function enquiry(r: APIRequestContext, id: string) {
  return (await r.get("/api/enquiries/" + id)).json();
}
async function command(r: APIRequestContext, id: string, body: unknown) {
  const e = await enquiry(r, id);
  const response = await post(r, `/enquiries/${id}/commands`, {
    revision: e.revision,
    command: body,
  });
  expect(response.status(), await response.text()).toBe(200);
}
test("due checks use the real local Queue and produce one reminder per task", async ({
  request,
}) => {
  expect((await post(request, "/management/jobs/sweep")).status()).toBe(200);
  await expect
    .poll(
      async () => {
        const list = await (await request.get("/api/management/jobs")).json();
        return list.jobs.filter(
          (j: { kind: string; status: string }) =>
            j.kind === "task_due" && j.status === "succeeded",
        ).length;
      },
      { timeout: 20000 },
    )
    .toBeGreaterThanOrEqual(2);
  const before = await (await request.get("/api/notifications")).json();
  expect(new Set(before.map((n: { job_id: string }) => n.job_id)).size).toBe(
    before.length,
  );
  await post(request, "/management/jobs/sweep");
  const after = await (await request.get("/api/notifications")).json();
  expect(after.length).toBe(before.length);
  expect((await request.get("/api/management/jobs")).status()).toBe(200);
  await expect
    .poll(
      async () => {
        const list = await (await request.get("/api/management/jobs")).json();
        return list.backups.some(
          (b: { status: string }) => b.status === "succeeded",
        );
      },
      { timeout: 20000 },
    )
    .toBe(true);
  const status = await (await request.get("/api/management/jobs")).json();
  expect(status.health.last_success).toBeTruthy();
  const backup = status.backups.find(
    (b: { status: string }) => b.status === "succeeded",
  );
  const download = await request.get(
    "/api/management/backups/" + encodeURIComponent(backup.id),
  );
  expect(download.status()).toBe(200);
  const bytes = await download.body();
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    download.headers()["x-backup-sha256"],
  );
  expect(JSON.parse(bytes.toString()).receipts.length).toBeGreaterThanOrEqual(
    2,
  );
});
test("manager settings enforce scope, revisions, safe colours and disabled outbound sends", async ({
  request,
}) => {
  const original = await (await request.get("/api/settings")).json();
  const settings = { ...original, defaultFollowupHours: 36 };
  const key = crypto.randomUUID();
  const first = await request.put("/api/management/settings", {
    headers: { ...headers, "Idempotency-Key": key },
    data: settings,
  });
  expect(first.status()).toBe(200);
  expect(
    (
      await request.put("/api/management/settings", {
        headers: { ...headers, "Idempotency-Key": key },
        data: settings,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.put("/api/management/settings", {
        headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
        data: settings,
      })
    ).status(),
  ).toBe(409);
  const current = await (await request.get("/api/settings")).json();
  expect(current.defaultFollowupHours).toBe(36);
  expect(
    (
      await request.put("/api/management/settings", {
        headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
        data: { ...current, outboundEnabled: true },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.put("/api/management/settings", {
        headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
        data: {
          ...current,
          stages: {
            ...current.stages,
            NEW: { label: "Unreadable", color: "#ffffff" },
          },
        },
      })
    ).status(),
  ).toBe(400);
  await post(request, "/local/session", { role: "staff" });
  for (const path of [
    "/management/jobs",
    "/management/audit",
    "/management/trips/DEMO-NORWAY/rules",
  ])
    expect((await request.get("/api" + path)).status()).toBe(403);
  expect((await post(request, "/management/jobs/sweep")).status()).toBe(403);
  expect((await post(request, "/management/backups")).status()).toBe(403);
  expect(
    (
      await request.put("/api/management/settings", {
        headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
        data: current,
      })
    ).status(),
  ).toBe(403);
});
test("rule publication previews changes, blocks stale data, preserves history and stays within the trip", async ({
  request,
}) => {
  const createdTrip = await (
    await post(request, "/management/trips", {
      name: "Synthetic second trip",
      destination: "Test destination",
      type: "bespoke",
      description: "Fictional rule-isolation fixture",
    })
  ).json();
  expect(createdTrip.id).toBeTruthy();
  const second = await (
    await post(request, "/enquiries", {
      name: "Other trip synthetic traveller",
      tripId: createdTrip.id,
    })
  ).json();
  await command(request, second.id, {
    type: "qualify",
    group: "solo",
    visa: "none",
    temperature: "warm",
    availability: "pending",
  });
  const secondBefore = await enquiry(request, second.id);
  await command(request, "DEMO-01", {
    type: "override",
    rank: "P6",
    reason: "Synthetic reviewed exception",
  });
  const confirmedBefore = await enquiry(request, "DEMO-09");
  const active = await (
    await request.get("/api/management/trips/DEMO-NORWAY/rules")
  ).json();
  const rules = active.rules.map(
    (r: { group: string; visa: string; rank: string; enabled: boolean }) =>
      r.group === "family" && r.visa === "all"
        ? { ...r, enabled: true, rank: "P3" }
        : r.group === "couple" && r.visa === "all"
          ? { ...r, rank: "P2" }
          : r,
  );
  const stale = await (
    await post(request, "/management/trips/DEMO-NORWAY/rules/preview", {
      rules,
    })
  ).json();
  await command(request, "DEMO-03", {
    type: "note",
    text: "Synthetic concurrent change after preview",
  });
  expect(
    (
      await post(request, "/management/trips/DEMO-NORWAY/rules/publish", {
        previewId: stale.id,
        reviewed: true,
      })
    ).status(),
  ).toBe(409);
  const preview = await (
    await post(request, "/management/trips/DEMO-NORWAY/rules/preview", {
      rules,
    })
  ).json();
  expect(
    preview.examples.find(
      (r: { group: string; visa: string }) =>
        r.group === "couple" && r.visa === "some",
    ).rank,
  ).toBeNull();
  const key = crypto.randomUUID();
  const published = await post(
    request,
    "/management/trips/DEMO-NORWAY/rules/publish",
    { previewId: preview.id, reviewed: true },
    key,
  );
  expect(published.status(), await published.text()).toBe(200);
  expect(
    (
      await post(
        request,
        "/management/trips/DEMO-NORWAY/rules/publish",
        { previewId: preview.id, reviewed: true },
        key,
      )
    ).status(),
  ).toBe(200);
  expect((await enquiry(request, "DEMO-03")).rank).toBe("P3");
  expect((await enquiry(request, "DEMO-01")).rank).toBe("P6");
  expect((await enquiry(request, "DEMO-07")).rank).toBeNull();
  expect((await enquiry(request, "DEMO-08")).rank).toBeNull();
  expect((await enquiry(request, "DEMO-09")).rank).toBe(confirmedBefore.rank);
  expect((await enquiry(request, "DEMO-09")).revision).toBe(
    confirmedBefore.revision,
  );
  expect((await enquiry(request, second.id)).revision).toBe(
    secondBefore.revision,
  );
  const next = await (
    await post(request, "/enquiries", {
      name: "New reviewed-fit fixture",
      tripId: "DEMO-NORWAY",
    })
  ).json();
  await command(request, next.id, {
    type: "qualify",
    group: "couple",
    visa: "all",
    temperature: "cold",
    availability: "pending",
  });
  expect((await enquiry(request, next.id)).rank).toBe("P2");
  const oldQuote = (await enquiry(request, "DEMO-05")).quote;
  let trip = (await (await request.get("/api/state")).json()).trips.find(
    (t: { id: string }) => t.id === "DEMO-NORWAY",
  );
  expect(trip.writeToken).toBeUndefined();
  const edited = await request.put("/api/trips/" + trip.id, {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: { ...trip, description: trip.description + " Synthetic amendment." },
  });
  expect(edited.status(), await edited.text()).toBe(200);
  trip = (await (await request.get("/api/state")).json()).trips.find(
    (t: { id: string }) => t.id === "DEMO-NORWAY",
  );
  const publishKey = crypto.randomUUID();
  expect(
    (
      await post(
        request,
        `/management/trips/${trip.id}/publish`,
        { version: trip.version, manualOnly: true },
        publishKey,
      )
    ).status(),
  ).toBe(200);
  expect(
    (
      await post(
        request,
        `/management/trips/${trip.id}/publish`,
        { version: trip.version, manualOnly: true },
        publishKey,
      )
    ).status(),
  ).toBe(200);
  expect((await enquiry(request, "DEMO-05")).quote).toEqual(oldQuote);
});
test("manager screens edit defaults and explicitly review a rule preview", async ({
  page,
  request,
}) => {
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Keep the little things reliable." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit settings", exact: true })
    .click();
  await page.getByLabel("Follow-up suggestion · hours").fill("48");
  await page
    .getByRole("button", { name: "Save defaults", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
  await expect(page.getByText("48 hours", { exact: true })).toBeVisible();
  await page.goto("/trips");
  await page
    .getByRole("button", { name: "Preview fit rules", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Preview affected enquiries", exact: true })
    .click();
  await expect(page.getByText(/enquiries will be recomputed/)).toBeVisible();
  await page
    .getByLabel(
      "I reviewed these rules and the affected profiles. Publish this version and recompute the listed enquiries.",
    )
    .check();
  await page
    .getByRole("button", { name: "Publish reviewed rules", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const data = await (
    await request.get("/api/management/trips/DEMO-NORWAY/rules")
  ).json();
  expect(data.activeVersion).toBe(2);
});

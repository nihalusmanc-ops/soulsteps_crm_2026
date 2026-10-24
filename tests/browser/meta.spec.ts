import { test, expect } from "@playwright/test";
const headers = { Origin: "http://127.0.0.1:8791", "X-Soulsteps-Request": "1" };
test("manager maps a fictional form and actual local Queue creates one qualified-for-review enquiry", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/settings");
  await page.getByRole("button", { name: "Meta intake", exact: true }).click();
  await expect(
    page.getByText("Live Meta is not connected", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Trip for Meta form", { exact: true })
    .selectOption({ index: 1 });
  await page
    .getByLabel("Staff owner for Meta form", { exact: true })
    .selectOption("DEMO-STAFF");
  await page
    .getByLabel("Mapping review reason", { exact: true })
    .fill("Reviewed synthetic page and exact fictional field names.");
  await page.getByLabel("I reviewed the exact form IDs").check();
  await page
    .getByRole("button", { name: "Save reviewed Meta mapping", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Reviewed mapping saved" }),
  ).toBeVisible();
  const status = await (
    await page.request.get("/api/management/meta/status")
  ).json();
  const form = status.forms.find((m: { version: number }) => m.version === 1);
  expect(form).toBeTruthy();
  const update = await page.request.put("/api/management/meta/forms", {
    headers,
    data: {
      ...form.data,
      reason: "Reviewed version two of the synthetic mapping",
    },
  });
  expect(update.status()).toBe(200);
  expect(
    (
      await page.request.put("/api/management/meta/forms", {
        headers,
        data: form.data,
      })
    ).status(),
  ).toBe(409);
  const fixture = await page.request.post("/api/management/meta/fixture", {
    headers,
    data: { scenario: "mapped" },
  });
  expect(fixture.status()).toBe(200);
  const { id } = await fixture.json();
  await expect
    .poll(
      async () => {
        const state = await (
          await page.request.get("/api/management/meta/status")
        ).json();
        return state.leads.find((r: { id: string }) => r.id === id)?.status;
      },
      { timeout: 20000 },
    )
    .toBe("completed");
  const detail = await (
    await page.request.get(`/api/management/meta/leads/${id}`)
  ).json();
  const enquiry = await (
    await page.request.get(`/api/enquiries/${detail.enquiry_id}`)
  ).json();
  expect(enquiry.source).toBe("Meta lead ad");
  expect(enquiry.rank).toBeNull();
  expect(enquiry.phone).toBeNull();
  expect(enquiry.tasks).toEqual([]);
  expect(enquiry.payments).toEqual([]);
  expect(enquiry.booking).toBeUndefined();
  expect(enquiry.originalNote).toContain(
    "booking_timeframe: Considering later",
  );
  expect(enquiry.originalNote).toContain("travel_selection: Not selected");
  const unknown = await page.request.post("/api/management/meta/fixture", {
    headers,
    data: { scenario: "unknown" },
  });
  const unknownId = (await unknown.json()).id;
  await expect
    .poll(
      async () => {
        const state = await (
          await page.request.get("/api/management/meta/status")
        ).json();
        return state.leads.find((r: { id: string }) => r.id === unknownId)
          ?.status;
      },
      { timeout: 20000 },
    )
    .toBe("review");
  const retry = await page.request.post("/api/management/meta/retry", {
    headers,
    data: { id: unknownId, refetch: true },
  });
  expect(retry.status()).toBe(200);
  const audit = await (await page.request.get("/api/management/audit")).json();
  const entry = audit.find(
    (row: { object_id: string; action: string }) =>
      row.object_id === unknownId && row.action === "meta.retry",
  );
  expect(JSON.parse(entry.data).refetch).toBe(true);
  expect(JSON.parse(entry.data).previousPayload).toContain(
    "Fictional Meta traveller",
  );
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("heading", { name: "Every lead has a traceable arrival." })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/meta-mobile.png" });
  expect(errors).toEqual([]);
});
test("staff cannot configure, inspect sources or retry Meta intake; local public ingress stays disabled", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Local demo identity").selectOption("staff");
  await expect(page.getByLabel("Local demo identity")).toHaveValue("staff");
  for (const path of ["status", "leads/990000000000123"])
    expect(
      (await page.request.get(`/api/management/meta/${path}`)).status(),
    ).toBe(403);
  for (const path of ["fixture", "retry", "sweep", "reconcile", "backfill"])
    expect(
      (
        await page.request.post(`/api/management/meta/${path}`, {
          headers,
          data: {},
        })
      ).status(),
    ).toBe(403);
  expect(
    (
      await page.request.put("/api/management/meta/forms", {
        headers,
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/webhooks/meta/leads", {
        data: { object: "page", entry: [] },
      })
    ).status(),
  ).toBe(503);
});

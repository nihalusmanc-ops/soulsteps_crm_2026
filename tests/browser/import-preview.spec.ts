import { test, expect } from "@playwright/test";
import fixture from "../../public/samples/import-preview.json" with { type: "json" };

test("manager previews historical evidence without changing enquiries", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const before = await (await page.request.get("/api/state")).json();
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "Import enquiries", exact: true })
    .click();
  await page.getByLabel("Choose preview JSON").setInputFiles({
    name: "synthetic.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(
    page.getByRole("status").filter({ hasText: "0 candidates" }),
  ).toBeVisible();
  await page.getByText("Row 2 · Fictional v2 traveller").click();
  await expect(
    page.getByText("Source ID: 90071992547409931", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save private review batch" }),
  ).toBeEnabled();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
  const after = await (await page.request.get("/api/state")).json();
  expect(after.enquiries).toEqual(before.enquiries);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel("Local demo identity").selectOption("staff");
  await expect(page.getByLabel("Local demo identity")).toHaveValue("staff");
  const response = await page.request.post("/api/management/imports/preview", {
    headers: { Origin: "http://127.0.0.1:8791", "X-Soulsteps-Request": "1" },
    data: fixture,
  });
  expect(response.status()).toBe(403);
  for (const path of [
    "/api/management/imports/batches",
    "/api/management/imports/options",
    "/api/management/imports/batches/missing/source",
  ])
    expect((await page.request.get(path)).status()).toBe(403);
});

test("reviewed synthetic import survives reload and commits once with raw history", async ({
  page,
}) => {
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "Import enquiries", exact: true })
    .click();
  await page.getByLabel("Choose preview JSON").setInputFiles({
    name: "fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page.getByRole("button", { name: "Save private review batch" }).click();
  const saved = page.getByTestId("saved-imports");
  await expect(saved.getByLabel("Review batch")).not.toHaveValue("");
  const batchId = await saved.getByLabel("Review batch").inputValue();
  await page.reload();
  await page
    .getByRole("button", { name: "Import preview", exact: true })
    .click();
  await saved.getByLabel("Review batch").selectOption(batchId);
  await saved
    .getByText("Row 2 · Fictional v2 traveller · review", { exact: true })
    .click();
  await saved
    .getByLabel("Trip for row 2", { exact: true })
    .selectOption({ index: 1 });
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await saved
    .getByLabel("Trip for row 2", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/import-review-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await saved
    .getByLabel("Owner for row 2", { exact: true })
    .selectOption("DEMO-STAFF");
  await saved
    .getByLabel("Review reason for row 2", { exact: true })
    .fill("Reviewed synthetic notes, do not infer historical dates.");
  await saved.getByLabel("I reviewed source notes and dates.").first().check();
  await saved
    .getByRole("button", { name: "Approve row 2", exact: true })
    .click();
  await expect(
    saved.getByText("Row 2 · Fictional v2 traveller · ready", { exact: true }),
  ).toBeVisible();
  await saved.getByLabel("Select row 2 for commit", { exact: true }).check();
  await saved.getByLabel("I reviewed the selected rows").check();
  await saved
    .getByRole("button", { name: "Commit 1 selected rows", exact: true })
    .click();
  await expect(
    saved.getByText("Row 2 · Fictional v2 traveller · committed", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(saved.getByRole("status")).toContainText("1 created");
  const source = await page.request.get(
    `/api/management/imports/batches/${batchId}/source`,
  );
  expect(await source.text()).toBe(JSON.stringify(fixture));
  const data = await (
    await page.request.get(`/api/management/imports/batches/${batchId}`)
  ).json();
  const committed = data.rows[0];
  const replay = await page.request.post(
    `/api/management/imports/batches/${batchId}/commit`,
    {
      headers: { Origin: "http://127.0.0.1:8791", "X-Soulsteps-Request": "1" },
      data: { rows: [committed.id], confirmed: true },
    },
  );
  expect((await replay.json()).counts.committed).toBe(1);
  const e = await (
    await page.request.get(`/api/enquiries/${committed.enquiry_id}`)
  ).json();
  expect(e.tasks).toHaveLength(0);
  expect(e.rank).toBeNull();
  expect(e.phone).toBeNull();
  expect(e.originalNote).toContain("Wednesday");
});

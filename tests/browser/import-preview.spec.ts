import { test, expect } from "@playwright/test";
import fixture from "../../public/samples/import-preview.json" with { type: "json" };

test("manager previews historical evidence without changing enquiries", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const before = await (await page.request.get("/api/state")).json();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Import preview", exact: true }).click();
  await page
    .getByLabel("Choose preview JSON")
    .setInputFiles({
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
    page.getByRole("button", { name: "Commit unavailable" }),
  ).toBeDisabled();
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
});

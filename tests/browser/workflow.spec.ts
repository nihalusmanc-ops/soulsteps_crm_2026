import { test, expect } from "@playwright/test";
test("daily flow, preserved history, financial confirmation and reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Enquiries", exact: true }),
  ).toBeVisible();
  await page.goto("/enquiries/DEMO-02");
  await page.getByRole("button", { name: "Log call", exact: true }).click();
  await page.getByLabel("Call colour", { exact: true }).selectOption("cyan");
  await page
    .getByLabel("Note", { exact: true })
    .fill("Browser QA fictional callback");
  await page.getByLabel("Next follow-up").fill("2026-10-25T10:00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Saving changes" }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "activity", exact: true }).click();
  await expect(
    page.getByText("cyan: Browser QA fictional callback", { exact: true }),
  ).toBeVisible();
  await page.goto("/enquiries/DEMO-05");
  await page.getByRole("button", { name: "Payments & booking" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm booking", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await page.getByLabel("Amount · AED").fill("2000");
  await page.getByLabel("Payment reference").fill("QA-ONLY");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm booking", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Verify funds", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Verify funds", exact: true })
    .click();
  await expect(
    page.getByText("Deposit verified · confirmation pending"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm booking", exact: true })
    .click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm booking", exact: true })
    .click();
  await expect(page.getByText("Confirmed · SS-DEMO-05")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Payments & booking" }).click();
  await expect(page.getByText("Confirmed · SS-DEMO-05")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open WhatsApp" }),
  ).toBeDisabled();
});
test("search, shared pipeline filters, draft editing and keyboard modal", async ({
  page,
}) => {
  await page.goto("/enquiries?view=pipeline");
  await page.getByLabel("Search enquiries").fill("Traveller H");
  await page.getByRole("button", { name: "Pipeline", exact: true }).click();
  await expect(page.locator(".pipeline-card")).toHaveCount(1);
  await page.goto("/trips/DEMO-NORWAY");
  await page.getByRole("button", { name: "Edit trip details" }).first().click();
  await page.getByLabel("Trip name").fill("Norway · QA draft");
  await page.getByRole("button", { name: "Save draft trip" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saving changes" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Norway · QA draft" }),
  ).toBeVisible();
  await page.goto("/settings?section=priorities");
  await page
    .locator(".setting-row")
    .filter({ hasText: /Norway/ })
    .getByRole("button", { name: "Edit priorities", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("responsive screens have no document overflow or runtime errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    for (const route of [
      "/",
      "/enquiries",
      "/enquiries/DEMO-12",
      "/trips",
      "/bookings",
      "/overview",
      "/settings",
    ]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      if (width === 1440 || width === 390)
        await page.screenshot({
          path: test
            .info()
            .outputPath(
              `${width}-${route.replaceAll("/", "_") || "today"}.png`,
            ),
          fullPage: true,
        });
    }
  }
  expect(errors).toEqual([]);
});

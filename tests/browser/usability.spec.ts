import { test, expect } from "@playwright/test";

test("dashboard summaries open the matching queue", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Outstanding deposits/ }).click();
  await expect(page).toHaveURL(/queue=deposits/);
  await expect(page.getByRole("button", { name: /^Deposits/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".queue")).toContainText("remaining");
  await page.getByRole("link", { name: /New \/ unassessed/ }).click();
  await expect(
    page.getByRole("button", { name: /^New \/ unassessed/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("search and pipeline survive opening a record, returning and reloading", async ({
  page,
}) => {
  await page.goto("/enquiries");
  await page.getByLabel("Search enquiries").fill("Traveller H");
  await page.getByRole("button", { name: "Pipeline", exact: true }).click();
  await expect(page.locator(".pipeline-card")).toHaveCount(1);
  await page.locator(".pipeline-card").click();
  await page.getByRole("link", { name: "All enquiries" }).click();
  await expect(page.getByLabel("Search enquiries")).toHaveValue("Traveller H");
  await expect(
    page.getByRole("button", { name: "Pipeline", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator(".pipeline-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await expect(page.getByLabel("Search enquiries")).toHaveValue("");
  await expect(page.locator(".pipeline-card").first()).toBeVisible();
});

test("rescheduling preserves task context and booking links open payments", async ({
  page,
}) => {
  await page.goto("/enquiries/DEMO-02");
  const enquiry = await (
    await page.request.get("/api/enquiries/DEMO-02")
  ).json();
  const task = enquiry.tasks
    .filter((t: { status: string }) => t.status === "pending")
    .sort((a: { due: string }, b: { due: string }) =>
      a.due.localeCompare(b.due),
    )[0];
  await page
    .getByRole("region", { name: "Next action" })
    .getByRole("button", { name: "Reschedule" })
    .click();
  await expect(page.getByLabel("Task type")).toHaveValue(task.type);
  await expect(page.getByLabel("Accepted date and time")).toHaveValue(
    new Date(Date.parse(task.due) + 4 * 3600000).toISOString().slice(0, 16),
  );
  await expect(
    page.getByRole("textbox", { name: "Notes", exact: true }),
  ).toHaveValue(task.note);
  await page.keyboard.press("Escape");
  await page.goto("/bookings");
  await page.locator(".booking-ref").first().click();
  await expect(page).toHaveURL(/tab=payments/);
  await expect(
    page.getByRole("heading", { name: "Payments & booking" }),
  ).toBeVisible();
});

test("mobile navigation traps focus, restores it, and provides readable record cards", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  const menu = page.getByRole("button", { name: "Open navigation" });
  await menu.click();
  const navigation = page.getByRole("dialog", { name: "Workspace navigation" });
  await expect(navigation).toBeVisible();
  await expect(
    navigation.getByRole("button", { name: "Close navigation" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(navigation.getByLabel("Local demo identity")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await menu.click();
  await navigation
    .getByRole("link", { name: "Enquiries", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Enquiries" })).toBeVisible();
  await expect(page.locator(".enquiry-mobile-card").first()).toBeVisible();
  await expect(page.locator(".enquiries-table")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

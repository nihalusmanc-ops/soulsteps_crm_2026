import { test, expect } from "@playwright/test";
test("calendar, controlled time, form data and nested dialog focus", async ({
  page,
}) => {
  await page.goto("/tests/controls/preview.html");
  await page
    .getByRole("button", {
      name: "Choose Follow-up date and time",
      exact: true,
    })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Follow-up date and time",
    exact: true,
  });
  await expect(
    picker.getByRole("button", { name: "Apply", exact: true }),
  ).toBeDisabled();
  await picker.getByRole("button", { name: "Tomorrow", exact: true }).click();
  await picker.getByLabel("Hour", { exact: true }).selectOption("14");
  await picker.getByLabel("Minute", { exact: true }).selectOption("35");
  await page.screenshot({ path: ".wrangler/picker-calendar.png" });
  await picker.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(
    page.getByLabel("Accepted date and time", { exact: false }),
  ).toHaveValue(/T14:35$/);
  await page
    .getByRole("button", { name: "Choose Business start time", exact: true })
    .click();
  const time = page.getByRole("dialog", {
    name: "Business start time",
    exact: true,
  });
  await time.getByLabel("Hour", { exact: true }).selectOption("08");
  await time.getByLabel("Minute", { exact: true }).selectOption("45");
  await time.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByLabel("Business start", { exact: true })).toHaveValue(
    "08:45",
  );
  await page.getByRole("button", { name: "Save preview", exact: true }).click();
  await expect(page.locator("#saved")).toContainText("08:45");
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .getByRole("button", {
        name: "Choose Follow-up date and time",
        exact: true,
      })
      .click();
    await picker.waitFor();
    await page.screenshot({
      path: ".wrangler/picker-calendar-" + width + ".png",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", {
        name: "Choose Follow-up date and time",
        exact: true,
      }),
    ).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Save preview", exact: true }),
    ).toBeVisible();
  }
});

test("date-only selection, leap day, cancel, clear and calendar keyboard", async ({
  page,
}) => {
  await page.goto("/tests/controls/preview.html");
  const field = page.getByLabel("Departure date", { exact: true });
  await page
    .getByRole("button", { name: "Choose Departure date", exact: true })
    .click();
  let picker = page.getByRole("dialog", {
    name: "Departure date",
    exact: true,
  });
  await picker.getByLabel("Calendar year").selectOption("2028");
  await picker.getByLabel("Calendar month").selectOption("1");
  await picker.locator('[data-day="2028-02-29"]').click();
  await picker.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(field).toHaveValue("2028-02-29");
  await page
    .getByRole("button", { name: "Choose Departure date", exact: true })
    .click();
  await picker.locator('[data-day="2028-02-29"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(picker.locator('[data-day="2028-03-01"]')).toBeFocused();
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(field).toHaveValue("2028-02-29");
  await page
    .getByRole("button", { name: "Choose Departure date", exact: true })
    .click();
  await picker.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(field).toHaveValue("");
  await field.fill("2027-01-03");
  await expect(field).toHaveValue("2027-01-03");
});

test("dropdown keyboard selection and disabled options", async ({ page }) => {
  await page.goto("/tests/controls/preview.html");
  const select = page.getByLabel("Task type", { exact: true });
  await select.click();
  await page.screenshot({ path: ".wrangler/picker-dropdown.png" });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(select).toHaveValue("Callback");
  await select.selectOption("Follow-up");
  await expect(select).toHaveValue("Follow-up");
});

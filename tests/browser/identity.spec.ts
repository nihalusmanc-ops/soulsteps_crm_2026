import { test, expect } from "@playwright/test";
test("local identity switch is backed by server permissions", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Local demo identity").selectOption("staff");
  await expect(page.getByLabel("Local demo identity")).toHaveValue("staff");
  await expect(page.getByRole("link", { name: "Overview M" })).toHaveCount(0);
  await page.goto("/overview");
  await expect(
    page.getByRole("heading", { name: "Manager view" }),
  ).toBeVisible();
  const response = await page.request.get("/api/reports");
  expect(response.status()).toBe(403);
});
test("repeat customer selection preserves enquiry history", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New enquiry", exact: true }).click();
  await page.getByLabel("Customer record").selectOption("CUSTOMER-1");
  await page
    .getByRole("button", { name: "Create enquiry", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Demo Traveller A" }),
  ).toBeVisible();
  await expect(page.getByLabel("Customer enquiry history")).toBeVisible();
  await page.getByLabel("Customer enquiry history").selectOption("DEMO-01");
  await expect(
    page.getByRole("heading", { name: "Demo Traveller A" }),
  ).toBeVisible();
});

import { test, expect } from "@playwright/test";
test("an existing invited session can set its first password without changing the login provider", async ({
  page,
}) => {
  await page.goto("/account/security");
  await expect(
    page.getByRole("heading", { name: "Set your password", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("New password", { exact: true })
    .fill("Fictional account passphrase!");
  await page
    .getByLabel("Confirm new password")
    .fill("A mismatched fictional phrase!");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "The passwords do not match",
  );
  await page
    .getByLabel("Confirm new password")
    .fill("Fictional account passphrase!");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your password is saved",
  );
  await expect(page.getByLabel("Current password")).toBeVisible();
  expect(
    (await (await page.request.get("/api/auth/options")).json()).method,
  ).toBe("access");
  expect((await (await page.request.get("/api/me")).json()).role).toBe(
    "manager",
  );
});

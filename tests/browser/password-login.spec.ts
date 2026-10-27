import { test, expect } from "@playwright/test";
const password = "Fictional browser passphrase 2026!";
test("Soulsteps sign-in, rejected password, private navigation, sign-out and session revocation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill("manager@example.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("wrong fictional password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Email or password is incorrect",
  );
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await page.locator(".profile-trigger").click();
  await page.getByRole("link", { name: "Account security" }).click();
  await page.getByLabel("Current password").fill(password);
  await page
    .getByLabel("New password", { exact: true })
    .fill("New fictional browser password!");
  await page
    .getByLabel("Confirm new password")
    .fill("New fictional browser password!");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your password is saved",
  );
  await page.locator(".profile-trigger").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  expect((await page.request.get("/api/state")).status()).toBe(401);
  await page.getByLabel("Email address").fill("manager@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Email or password is incorrect",
  );
  await page
    .getByLabel("Password", { exact: true })
    .fill("New fictional browser password!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
});
test("staff password session retains server-enforced role permissions", async ({
  page,
}) => {
  await page.goto("/overview");
  await page.getByLabel("Email address").fill("staff@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Manager view" }),
  ).toBeVisible();
  expect((await page.request.get("/api/reports")).status()).toBe(403);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Profile", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Workspace settings", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/management/jobs")).status()).toBe(403);
});
test("branded login is readable on desktop, tablet and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`login-${width}.png`),
      fullPage: true,
    });
    await page
      .getByLabel("Password", { exact: true })
      .fill("A fictional visibility test");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
      "type",
      "text",
    );
    await page.getByRole("button", { name: "Hide password" }).click();
  }
  expect(errors).toEqual([]);
});

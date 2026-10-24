import { test, expect } from "@playwright/test";
test("release view reports operational evidence and security headers without granting approval", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/settings");
  expect(response!.headers()["x-frame-options"]).toBe("DENY");
  expect(response!.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  await page
    .getByRole("button", { name: "Release readiness", exact: true })
    .click();
  await expect(
    page.getByText("Release approval requires external evidence", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Cloud billing / budget alerts", { exact: true }),
  ).toBeVisible();
  const api = await page.request.get("/api/management/release");
  expect(api.status()).toBe(200);
  expect(api.headers()["cache-control"]).toBe("no-store");
  expect(api.headers()["x-frame-options"]).toBe("DENY");
  const body = await api.json();
  expect(body.releaseApproved).toBeNull();
  expect(body.cloudBilling.spend).toBeNull();
  expect(body.checks.find((c: { id: string }) => c.id === "mode").status).toBe(
    "blocked",
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
    .getByRole("heading", { name: "Prepare a release with evidence." })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/release-mobile.png" });
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel("Local demo identity").selectOption("staff");
  await expect(page.getByLabel("Local demo identity")).toHaveValue("staff");
  expect((await page.request.get("/api/management/release")).status()).toBe(
    403,
  );
});

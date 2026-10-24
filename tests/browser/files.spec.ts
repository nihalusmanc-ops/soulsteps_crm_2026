import { test, expect } from "@playwright/test";
test("receipt form persists an authorised private attachment", async ({
  page,
}) => {
  await page.goto("/enquiries/DEMO-07");
  await page.getByRole("button", { name: "files", exact: true }).click();
  await page
    .getByLabel("Receipt file")
    .setInputFiles({
      name: "synthetic-browser-test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nSynthetic UI test only\n%%EOF"),
    });
  await page.getByRole("button", { name: "Upload private receipt" }).click();
  await expect(
    page.getByText("synthetic-browser-test.pdf", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "files", exact: true }).click();
  await expect(
    page.getByText("synthetic-browser-test.pdf", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download privately" }),
  ).toHaveAttribute("href", /\/api\/files\//);
});

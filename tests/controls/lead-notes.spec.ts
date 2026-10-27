import { test, expect } from "@playwright/test";
import type { Enquiry, State } from "../../src/shared/domain";
import { defaultSettings } from "../../src/shared/management";
test("notes are beside leads, filter by client status and open in a responsive keyboard-accessible drawer", async ({
  page,
}) => {
  const e: Enquiry = {
    id: "PREVIEW-LEAD",
    customerId: "PREVIEW-CUSTOMER",
    name: "Fictional Traveller",
    email: "preview@example.invalid",
    phone: null,
    tripId: "PREVIEW-TRIP",
    stage: "INTERESTED",
    temperature: "warm",
    group: "solo",
    visa: "unknown",
    travellers: 1,
    rank: null,
    rankReason: "Needs qualification",
    response: "none",
    owner: "Shared team",
    shared: true,
    source: "Synthetic preview",
    createdAt: new Date().toISOString(),
    originalNote: "Synthetic notes only",
    originalGroup: "solo",
    availability: "pending",
    tasks: [],
    activities: [],
    payments: [],
    revision: 0,
  };
  const state: State = {
    version: 1,
    enquiries: [e],
    trips: [
      {
        id: "PREVIEW-TRIP",
        name: "Preview trip",
        destination: "Norway",
        status: "draft",
        description: "",
        type: "bespoke",
        departure: "",
        availabilityNote: "Needs qualification",
        itinerary: "",
        price: null,
        deposit: null,
        version: 1,
        groupVisaPolicy: "review",
      },
    ],
  };
  e.workbook = {
    colour: "yellow",
    colours: ["FFFFFF00"],
    latestNote: "Itinerary sent. Call on 20th October.",
    notes: [
      {
        text: "Itinerary sent. Call on 20th October.",
        sheet: "Synthetic source",
        row: 2,
        cell: "V2",
      },
    ],
    nextStep: "Follow up on the itinerary already sent.",
    followup: {
      date: "2026-10-20",
      text: "Call on 20th October.",
      needsConfirmation: true,
      reason: "Agree a time before scheduling.",
    },
    reviewReasons: [],
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body =
      path === "/api/me"
        ? {
            id: "PREVIEW",
            name: "Fictional manager",
            role: "manager",
            local: true,
          }
        : path === "/api/auth/options"
          ? { method: "access" }
          : path === "/api/state"
            ? state
            : path === "/api/settings"
              ? defaultSettings
              : [];
    await route.fulfill({ json: body });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/enquiries");
  const open = page.getByRole("button", {
    name: `View notes for ${e.name}`,
    exact: true,
  });
  await open.click();
  const drawer = page.getByRole("dialog", {
    name: "Client notes",
    exact: true,
  });
  await expect(drawer).toContainText("Itinerary sent. Call on 20th October.");
  await expect(drawer).toContainText("20 Oct 2026");
  await expect(drawer).toContainText(
    "Follow up on the itinerary already sent.",
  );
  await page.screenshot({ path: ".wrangler/lead-notes-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await page.getByRole("button", { name: "More filters", exact: true }).click();
  await page.getByLabel("Filter workbook colour").selectOption("yellow");
  await expect(
    page.getByRole("button", { name: /^View notes for/ }),
  ).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await open.click();
  await expect(drawer).toBeVisible();
  await page.screenshot({ path: ".wrangler/lead-notes-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  expect(errors).toEqual([]);
});

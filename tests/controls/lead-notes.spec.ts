import { test, expect } from "@playwright/test";
import type { Enquiry, State } from "../../src/shared/domain";
import { defaultSettings } from "../../src/shared/management";
test("inline notes, profile editing, customer reuse and protected deletion remain usable", async ({
  page,
}) => {
  let role = "manager";
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
    source: "Meta workbook",
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
            role,
            local: false,
          }
        : path === "/api/auth/options"
          ? { method: "access" }
          : path === "/api/state"
            ? state
            : path === "/api/customers"
              ? [
                  {
                    id: e.customerId,
                    name: e.name,
                    email: e.email,
                    phone: e.phone,
                  },
                ]
              : path === "/api/settings"
                ? defaultSettings
                : [];
    await route.fulfill({ json: body });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/enquiries");
  await expect(
    page.getByLabel("Note for " + e.name, { exact: true }),
  ).toHaveValue("Itinerary sent. Call on 20th October.");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator(".call-row").first().locator(".call-trip").click();
  await expect(page).toHaveURL(/\/enquiries\/PREVIEW-LEAD/);
  await expect(page.locator("body")).not.toContainText(/\bworkbook\b/i);
  await expect(page.locator("header")).not.toContainText("Staff workspace");
  let saved: any;
  await page.route("**/api/enquiries/PREVIEW-LEAD/commands", async (route) => {
    saved = route.request().postDataJSON().command;
    Object.assign(e, saved, { revision: 1 });
    await route.fulfill({ json: { ok: true } });
  });
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit details", exact: true });
  await edit
    .getByLabel("Customer name", { exact: true })
    .fill("Fictional Updated");
  await edit.getByLabel("Phone", { exact: true }).fill("+971500000001");
  await edit.getByLabel("Self-drive option").selectOption("yes");
  await edit.getByLabel("Number of travellers").fill("3");
  await edit.getByRole("button", { name: /save/i }).click();
  await expect.poll(() => saved?.name).toBe("Fictional Updated");
  expect(saved).toMatchObject({
    phone: "+971500000001",
    selfDrive: "yes",
    travellers: 3,
  });
  await expect(edit).not.toBeVisible();
  await page.goto("/enquiries");
  await page.getByRole("button", { name: "New enquiry", exact: true }).click();
  const create = page.getByRole("dialog", { name: "New enquiry", exact: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(create).not.toContainText(/demo|fictional/i);
  await create
    .getByLabel("Search existing customers")
    .fill("preview@example.invalid");
  await create.getByRole("button", { name: /Fictional Updated/ }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    create.getByLabel("Customer name", { exact: true }),
  ).toBeDisabled();
  await create.getByLabel("Trip", { exact: true }).selectOption("PREVIEW-TRIP");
  let created: any;
  await page.route("**/api/enquiries", async (route) => {
    created = route.request().postDataJSON();
    await route.fulfill({ json: { id: e.id } });
  });
  await create
    .getByRole("button", { name: "Create enquiry", exact: true })
    .click();
  await expect.poll(() => created?.customerId).toBe("PREVIEW-CUSTOMER");
  expect(created.name).toBe("Fictional Updated");
  await expect(create).not.toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/trips");
  await page
    .locator(".trips-list-desktop")
    .getByLabel("More actions for Preview trip")
    .click();
  await page.getByRole("button", { name: "Delete trip", exact: true }).click();
  const blocked = page.getByRole("dialog", {
    name: "Delete trip?",
    exact: true,
  });
  await expect(blocked).toContainText("This trip has enquiries");
  await blocked.getByRole("button", { name: "Close", exact: true }).click();
  await page.goto("/enquiries/PREVIEW-LEAD");
  await page
    .getByRole("button", { name: "Delete enquiry", exact: true })
    .click();
  const deletion = page.getByRole("dialog", {
    name: "Delete enquiry?",
    exact: true,
  });
  await deletion.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/enquiries\/PREVIEW-LEAD/);
  await page
    .getByRole("button", { name: "Delete enquiry", exact: true })
    .click();
  let deleted = "";
  await page.route("**/api/enquiries/PREVIEW-LEAD", async (route) => {
    deleted = route.request().method();
    state.enquiries = [];
    await route.fulfill({ json: { ok: true } });
  });
  await deletion.getByRole("checkbox").check();
  await deletion
    .getByRole("button", { name: "Delete enquiry", exact: true })
    .click();
  await expect(page).toHaveURL(/\/enquiries$/);
  expect(deleted).toBe("DELETE");
  await page.goto("/trips");
  await page
    .locator(".trips-list-desktop")
    .getByLabel("More actions for Preview trip")
    .click();
  await page.getByRole("button", { name: "Delete trip", exact: true }).click();
  const tripDeletion = page.getByRole("dialog", {
    name: "Delete trip?",
    exact: true,
  });
  await tripDeletion.getByRole("checkbox").check();
  await page.route("**/api/trips/PREVIEW-TRIP", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    state.trips = [];
    await route.fulfill({ json: { ok: true } });
  });
  await tripDeletion
    .getByRole("button", { name: "Delete trip", exact: true })
    .click();
  await expect(page.getByText("No trips yet", { exact: true })).toBeVisible();
  role = "staff";
  state.enquiries = [e];
  await page.goto("/enquiries/PREVIEW-LEAD");
  await expect(
    page.getByRole("heading", { name: e.name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete enquiry", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

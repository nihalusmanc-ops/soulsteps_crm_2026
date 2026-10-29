import { test, expect, type Page } from "@playwright/test";
import type { State, Trip, Enquiry } from "../../src/shared/domain";
import { defaultSettings } from "../../src/shared/management";
async function setup(page: Page, role: "manager" | "staff" = "manager") {
  const base: Trip = {
    id: "NORWAY",
    name: "Norway winter journey",
    destination: "Norway",
    status: "published",
    description: "A small group journey.",
    type: "fixed",
    departure: "2026-12-10",
    price: 1200000,
    deposit: 300000,
    itinerary: "Day 1: Arrival\nDay 2: Northern lights",
    availabilityNote: "Confirm rooms with the supplier.",
    version: 1,
    groupVisaPolicy: "review",
  };
  const lead: Enquiry = {
    id: "ENQUIRY",
    customerId: "CUSTOMER",
    name: "Test traveller",
    email: "preview@example.invalid",
    phone: null,
    tripId: base.id,
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
    source: "Manual",
    createdAt: new Date().toISOString(),
    originalNote: "Test note",
    originalGroup: "solo",
    availability: "pending",
    tasks: [],
    activities: [],
    payments: [],
    revision: 0,
  };
  const state: State = {
    version: 1,
    trips: [
      base,
      {
        ...base,
        id: "ALPS",
        name: "Alpine escape",
        destination: "Austria",
        status: "draft",
        departure: "",
        price: null,
        deposit: null,
        itinerary: "",
        availabilityNote: "",
        description: "",
      },
      {
        ...base,
        id: "JAPAN",
        name: "Japan discovery",
        destination: "Japan",
        status: "inactive",
        departure: "2027-03-12",
      },
    ],
    enquiries: [
      lead,
      {
        ...lead,
        id: "BOOKED",
        customerId: "BOOKED-CUSTOMER",
        name: "Booked traveller",
        stage: "CONFIRMED",
        quote: {
          id: "QUOTE",
          total: 1200000,
          deposit: 300000,
          currency: "AED",
          accepted: true,
          terms: "Existing agreed terms",
          issuedAt: new Date().toISOString(),
        },
        payments: [
          {
            id: "PAYMENT",
            amount: 300000,
            currency: "AED",
            date: new Date().toISOString(),
            reference: "TEST-PAYMENT",
            status: "verified",
          },
        ],
        booking: {
          reference: "SS-TEST",
          confirmedAt: new Date().toISOString(),
          actor: "Test manager",
        },
      },
    ],
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json:
        path === "/api/me"
          ? { id: "TEST", name: "Test user", role, local: false }
          : path === "/api/auth/options"
            ? { method: "access" }
            : path === "/api/state"
              ? state
              : path === "/api/settings"
                ? defaultSettings
                : [],
    });
  });
  return state;
}
test("trip list filters and sorts, opens from a whole row, links bookings and preserves navigation", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/trips");
  const rows = page.locator(".trips-list-table tbody tr");
  await expect(rows).toHaveCount(3);
  await page.getByLabel("Sort trips", { exact: true }).selectOption("name");
  await expect(rows.first()).toContainText("Alpine escape");
  await page.getByLabel("Search trips", { exact: true }).fill("Norway");
  await page
    .getByLabel("Filter trip status", { exact: true })
    .selectOption("published");
  await expect(rows).toHaveCount(1);
  await page.screenshot({ path: ".wrangler/trips-list-desktop.png" });
  await rows.first().locator("td").nth(1).click();
  await expect(page).toHaveURL(/\/trips\/NORWAY$/);
  await expect(
    page.getByRole("heading", { name: "Norway winter journey", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Day 2: Northern lights", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review publication", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: ".wrangler/trip-profile-desktop.png" });
  await page.getByRole("button", { name: "Bookings (1)", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /Booked traveller/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "All trips", exact: true }).click();
  await expect(page.getByLabel("Search trips", { exact: true })).toHaveValue(
    "Norway",
  );
  await expect(
    page.getByLabel("Filter trip status", { exact: true }),
  ).toHaveValue("published");
  await page
    .getByRole("link", { name: "Norway winter journey", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enquiries (2)", exact: true })
    .click();
  await page.getByRole("link", { name: /^Test traveller/ }).click();
  await expect(page).toHaveURL(/\/enquiries\/ENQUIRY$/);
  await page.getByRole("link", { name: "Back to trip", exact: true }).click();
  await expect(page).toHaveURL(/\/trips\/NORWAY\?tab=enquiries/);
  await page.locator(".trip-advanced>summary").click();
  await expect(
    page.getByRole("button", { name: "Preview fit rules", exact: true }),
  ).toBeVisible();
  await page.goto("/trips?q=missing");
  await expect(
    page.getByText("No matching trips", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(rows).toHaveCount(3);
});
test("trip creation and editing group fields, validate deposits, and retain supplied details", async ({
  page,
}) => {
  const state = await setup(page);
  let created: any, edited: any;
  await page.route("**/api/management/trips", async (route) => {
    created = route.request().postDataJSON();
    state.trips.push({
      ...created,
      id: "NEW",
      version: 1,
      status: "draft",
      groupVisaPolicy: "review",
    });
    await route.fulfill({ json: { id: "NEW" } });
  });
  await page.goto("/trips");
  await page.getByRole("button", { name: "New trip", exact: true }).click();
  const create = page.getByRole("dialog", {
    name: "Create draft trip",
    exact: true,
  });
  await page.screenshot({ path: ".wrangler/trip-create-dialog.png" });
  await create
    .getByLabel("Trip name", { exact: true })
    .fill("New test journey");
  await create.getByLabel("Destination", { exact: true }).fill("Iceland");
  await create
    .getByLabel("Journey type", { exact: true })
    .selectOption("bespoke");
  await create.getByLabel(/Price per person/).fill("1000");
  await create.getByLabel(/Deposit · AED/).fill("1200");
  await create
    .getByRole("button", { name: "Create draft", exact: true })
    .click();
  await expect(create.getByRole("alert")).toContainText(
    "Deposit exceeds trip price",
  );
  expect(created).toBeUndefined();
  await create.getByLabel(/Deposit · AED/).fill("200");
  await create.getByLabel("Itinerary", { exact: true }).fill("Day 1: Arrival");
  await create
    .getByRole("button", { name: "Create draft", exact: true })
    .click();
  await expect(page).toHaveURL(/\/trips\/NEW$/);
  expect(created).toMatchObject({
    price: 100000,
    deposit: 20000,
    destination: "Iceland",
    type: "bespoke",
    itinerary: "Day 1: Arrival",
  });
  await page.route("**/api/trips/NEW", async (route) => {
    edited = route.request().postDataJSON();
    state.trips[state.trips.findIndex((t) => t.id === "NEW")] = {
      ...edited,
      version: edited.version + 1,
      status: "draft",
    };
    await route.fulfill({ json: { version: 2 } });
  });
  await page
    .getByRole("button", { name: "Edit trip details", exact: true })
    .click();
  const edit = page.getByRole("dialog", {
    name: "Edit draft trip",
    exact: true,
  });
  await edit.getByLabel("Destination", { exact: true }).fill("Finland");
  await edit.getByLabel("Journey type", { exact: true }).selectOption("fixed");
  await edit
    .getByRole("button", { name: "Save draft trip", exact: true })
    .click();
  await expect(edit).not.toBeVisible();
  await expect.poll(() => edited?.destination).toBe("Finland");
  expect(edited.type).toBe("fixed");
  await expect(page.locator(".trip-page-kicker")).toContainText("Finland");
  await expect(
    page.getByText("Existing agreed terms", { exact: true }),
  ).toHaveCount(0);
});
test("staff trip views work on mobile without manager controls and empty fields stay clear", async ({
  page,
}) => {
  await setup(page, "staff");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/trips");
  await expect(
    page.getByRole("button", { name: "New trip", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Alpine escape", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".wrangler/trips-list-mobile.png" });
  await page
    .locator(".trip-mobile-item")
    .filter({ hasText: "Alpine escape" })
    .locator(".trip-mobile-facts")
    .click();
  await expect(page).toHaveURL(/\/trips\/ALPS$/);
  await expect(
    page.getByRole("heading", { name: "Alpine escape", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".trip-pricing")).toContainText("Not set");
  await expect(
    page.getByRole("button", { name: "Edit trip details", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".trip-advanced")).toHaveCount(0);
  await expect(page.getByLabel("More actions for Alpine escape")).toHaveCount(
    0,
  );
  await page.screenshot({ path: ".wrangler/trip-profile-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const width of [768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/trips");
    await expect(
      page.getByRole("link", { name: "Norway winter journey", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("link", { name: "Norway winter journey", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Norway winter journey", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/trips/ALPS");
  await page.getByRole("button", { name: "Bookings (0)", exact: true }).click();
  await expect(
    page.getByText("No confirmed bookings yet", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "All trips", exact: true }).click();
  await page
    .getByRole("link", { name: "Norway winter journey", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Norway winter journey", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

import { test, expect, type Page } from "@playwright/test";
import { applyCommand, type State } from "../../src/shared/domain";
import { defaultSettings } from "../../src/shared/management";
const actor = {
  id: "TEST",
  name: "Test manager",
  role: "manager" as const,
  local: false,
};
async function setup(page: Page) {
  const state: State = {
    version: 1,
    trips: [
      {
        id: "TRIP",
        name: "Test journey",
        destination: "Norway",
        status: "draft",
        description: "Original description",
        type: "bespoke",
        departure: "",
        availabilityNote: "",
        itinerary: "",
        price: null,
        deposit: null,
        version: 1,
        groupVisaPolicy: "review",
      },
    ],
    enquiries: [
      {
        id: "LEAD",
        customerId: "CUSTOMER",
        name: "Test traveller",
        email: "test@example.invalid",
        phone: null,
        tripId: "TRIP",
        stage: "QUALIFYING",
        temperature: "unassessed",
        group: "unknown",
        visa: "unknown",
        travellers: null,
        rank: null,
        rankReason: "Needs qualification",
        response: "none",
        owner: "Shared team",
        shared: true,
        source: "Manual",
        createdAt: new Date().toISOString(),
        originalNote: "Original note",
        originalGroup: "unknown",
        availability: "pending",
        tasks: [],
        activities: [],
        payments: [],
        revision: 0,
      },
    ],
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json:
        path === "/api/me"
          ? actor
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
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function addNote(page: Page, text: string) {
  await page
    .getByRole("button", { name: "Add note", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Add a note", exact: true });
  await dialog.getByLabel("Note", { exact: true }).fill(text);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  return dialog;
}
test("routine edits render before the response, roll back on failure, and retry the same request", async ({
  page,
}) => {
  const state = await setup(page);
  let hold = gate(),
    fail = true;
  const keys: string[] = [];
  await page.route("**/api/enquiries/LEAD/commands", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    const body = route.request().postDataJSON();
    await hold.promise;
    if (fail)
      await route.fulfill({
        status: 503,
        json: { message: "Temporary save failure" },
      });
    else {
      state.enquiries[0] = applyCommand(
        state.enquiries[0],
        body.command,
        "review",
        { actor: actor.name, demo: false },
      );
      await route.fulfill({ json: { revision: state.enquiries[0].revision } });
    }
  });
  await page.goto("/enquiries/LEAD");
  const dialog = await addNote(page, "Optimistic note");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".timeline")).toContainText("Optimistic note");
  await expect(
    page.getByRole("status").filter({ hasText: "Saving changes" }),
  ).toBeVisible();
  expect(state.enquiries[0].activities).toHaveLength(0);
  hold.release();
  await expect(page.getByRole("alert")).toContainText("Temporary save failure");
  await expect(page.locator(".timeline")).not.toContainText("Optimistic note");
  hold = gate();
  fail = false;
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect.poll(() => keys.length).toBe(2);
  expect(keys[1]).toBe(keys[0]);
  hold.release();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".timeline")).toContainText("Optimistic note");
  expect(
    state.enquiries[0].activities.filter((a) => a.text === "Optimistic note"),
  ).toHaveLength(1);
});
test("a lost response reconciles a committed change and retries without duplication", async ({
  page,
}) => {
  const state = await setup(page),
    keys: string[] = [];
  await page.route("**/api/enquiries/LEAD/commands", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1) {
      state.enquiries[0] = applyCommand(
        state.enquiries[0],
        route.request().postDataJSON().command,
        "review",
        { actor: actor.name, demo: false },
      );
      await route.fulfill({
        status: 503,
        json: { message: "Response interrupted" },
      });
    } else
      await route.fulfill({ json: { revision: state.enquiries[0].revision } });
  });
  await page.goto("/enquiries/LEAD");
  await addNote(page, "Saved once");
  await expect(page.getByRole("alert")).toContainText("Response interrupted");
  await expect(page.locator(".timeline")).toContainText("Saved once");
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect.poll(() => keys.length).toBe(2);
  expect(keys[1]).toBe(keys[0]);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(state.enquiries[0].revision).toBe(1);
  expect(state.enquiries[0].activities).toHaveLength(1);
});
test("trip content previews immediately while quotations wait for confirmation", async ({
  page,
}) => {
  const state = await setup(page);
  let hold = gate();
  await page.route("**/api/trips/TRIP", async (route) => {
    const trip = route.request().postDataJSON();
    await hold.promise;
    state.trips[0] = { ...trip, status: "draft", version: trip.version + 1 };
    await route.fulfill({ json: { version: state.trips[0].version } });
  });
  await page.goto("/trips");
  await page
    .getByRole("button", { name: "Edit trip details", exact: true })
    .click();
  const edit = page.getByRole("dialog", {
    name: "Edit draft trip",
    exact: true,
  });
  await edit.getByLabel("Trip name", { exact: true }).fill("Updated journey");
  await edit
    .getByRole("button", { name: "Save draft trip", exact: true })
    .click();
  await expect(edit).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Updated journey", exact: true }),
  ).toBeVisible();
  expect(state.trips[0].name).toBe("Test journey");
  hold.release();
  await expect(
    page.getByRole("status").filter({ hasText: "Saving changes" }),
  ).toHaveCount(0);
  hold = gate();
  await page.route("**/api/enquiries/LEAD/commands", async (route) => {
    const body = route.request().postDataJSON();
    await hold.promise;
    state.enquiries[0] = applyCommand(
      state.enquiries[0],
      body.command,
      "review",
      { actor: actor.name, demo: false },
    );
    await route.fulfill({ json: { revision: 1 } });
  });
  await page.goto("/enquiries/LEAD?tab=payments");
  await page
    .getByRole("button", { name: "Record quotation", exact: true })
    .click();
  const quote = page.getByRole("dialog", {
    name: "Record accepted quotation",
    exact: true,
  });
  await quote.getByLabel(/Booking total/).fill("1000");
  await quote.getByLabel(/Required deposit/).fill("200");
  await quote
    .getByLabel("Accepted terms", { exact: true })
    .fill("Terms agreed");
  await quote.getByRole("checkbox").check();
  await quote.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    quote.getByRole("button", { name: "Saving…", exact: true }),
  ).toBeDisabled();
  await expect(quote).toBeVisible();
  expect(state.enquiries[0].quote).toBeUndefined();
  hold.release();
  await expect(quote).not.toBeVisible();
  await expect(page.getByText("Terms agreed", { exact: true })).toBeVisible();
});
test("seen reminders disappear immediately and return when saving fails", async ({
  page,
}) => {
  await setup(page);
  const hold = gate();
  const reminder = {
    id: "REMINDER",
    enquiry_id: "LEAD",
    task_id: "TASK",
    job_id: "JOB",
    created_at: new Date().toISOString(),
    read_at: null,
    name: "Reminder traveller",
    task: JSON.stringify({ type: "Follow-up", due: "2026-10-29T10:00:00Z" }),
  };
  await page.route("**/api/notifications", (route) =>
    route.fulfill({ json: [reminder] }),
  );
  await page.route("**/api/notifications/REMINDER/read", async (route) => {
    await hold.promise;
    await route.fulfill({
      status: 503,
      json: { message: "Reminder update failed" },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Mark seen", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Due reminders", exact: true }),
  ).toHaveCount(0);
  hold.release();
  await expect(
    page.getByRole("heading", { name: "Due reminders", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Reminder update failed");
});
test("an interrupted payment response reconciles the saved record and retries without duplication", async ({
  page,
}) => {
  const state = await setup(page),
    keys: string[] = [];
  state.enquiries[0] = applyCommand(
    state.enquiries[0],
    {
      type: "quote",
      total: 100000,
      deposit: 20000,
      terms: "Agreed test terms",
    },
    "review",
    { actor: actor.name, demo: false },
  );
  await page.route("**/api/enquiries/LEAD/commands", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1) {
      state.enquiries[0] = applyCommand(
        state.enquiries[0],
        route.request().postDataJSON().command,
        "review",
        { actor: actor.name, demo: false },
      );
      await route.fulfill({
        status: 503,
        json: { message: "Payment response interrupted" },
      });
    } else
      await route.fulfill({ json: { revision: state.enquiries[0].revision } });
  });
  await page.goto("/enquiries/LEAD?tab=payments");
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Record payment",
    exact: true,
  });
  await dialog.getByLabel(/Amount/).fill("200");
  await dialog
    .getByLabel("Payment reference", { exact: true })
    .fill("TEST-REFERENCE");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Payment response interrupted",
  );
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  expect(state.enquiries[0].payments).toHaveLength(1);
  expect(state.enquiries[0].payments[0].status).toBe("pending");
});
test("payment entry appears immediately as unverified, rolls back on failure and never enables confirmation", async ({
  page,
}) => {
  const state = await setup(page);
  state.enquiries[0] = applyCommand(
    state.enquiries[0],
    { type: "quote", total: 100000, deposit: 20000, terms: "Agreed terms" },
    "review",
    { actor: actor.name, demo: false },
  );
  let hold = gate(),
    fail = true;
  const keys: string[] = [];
  await page.route("**/api/enquiries/LEAD/commands", async (route) => {
    const body = route.request().postDataJSON();
    keys.push(route.request().headers()["idempotency-key"]);
    await hold.promise;
    if (fail)
      await route.fulfill({
        status: 503,
        json: { message: "Payment could not be saved" },
      });
    else {
      state.enquiries[0] = applyCommand(
        state.enquiries[0],
        body.command,
        "review",
        { actor: actor.name, demo: false },
      );
      await route.fulfill({ json: { revision: state.enquiries[0].revision } });
    }
  });
  await page.goto("/enquiries/LEAD?tab=payments");
  await expect(page.getByText(/fictional/i)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Record payment",
    exact: true,
  });
  await dialog.getByLabel(/Amount/).fill("200");
  await dialog
    .getByLabel("Payment reference", { exact: true })
    .fill("IMMEDIATE-PAYMENT");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const row = page
    .locator(".payment-row")
    .filter({ hasText: "IMMEDIATE-PAYMENT" });
  await expect(row).toContainText("Unverified");
  await expect(
    row.getByRole("button", { name: "Verify funds", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Confirm booking", exact: true }),
  ).toBeDisabled();
  expect(state.enquiries[0].payments).toHaveLength(0);
  hold.release();
  await expect(page.getByRole("alert")).toContainText(
    "Payment could not be saved",
  );
  await expect(row).toHaveCount(0);
  hold = gate();
  fail = false;
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect.poll(() => keys.length).toBe(2);
  expect(keys[1]).toBe(keys[0]);
  hold.release();
  await expect(row).toContainText("Unverified");
  await expect(
    row.getByRole("button", { name: "Verify funds", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Confirm booking", exact: true }),
  ).toBeDisabled();
  expect(state.enquiries[0].payments).toHaveLength(1);
  expect(state.enquiries[0].payments[0].status).toBe("pending");
  await page.goto("/bookings");
  await expect(
    page.getByRole("heading", { name: "Bookings", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/fictional/i)).toHaveCount(0);
});

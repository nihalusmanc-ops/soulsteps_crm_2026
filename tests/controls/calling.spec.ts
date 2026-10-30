import { test, expect, type Page } from "@playwright/test";
import { applyCommand, type State, type Trip } from "../../src/shared/domain";
import { reviewSamples } from "../../src/shared/review-samples";
import {
  defaultRules,
  defaultSettings,
  evaluateRules,
} from "../../src/shared/management";

async function setup(page: Page, role = "staff") {
  const trip: Trip = {
    id: "NORWAY",
    name: "Norway",
    destination: "Norway",
    status: "draft",
    description: "",
    type: "fixed",
    departure: "",
    availabilityNote: "",
    itinerary: "",
    price: null,
    deposit: null,
    version: 1,
    groupVisaPolicy: "review",
    activeRules: defaultRules,
    activeRuleVersion: 1,
  };
  const state: State = {
    version: 1,
    trips: [trip],
    enquiries: reviewSamples(trip.id, "STAFF"),
  };
  const commands: any[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/commands")) {
      const body = route.request().postDataJSON();
      commands.push(body);
      const index = state.enquiries.findIndex(
        (e) => path === `/api/enquiries/${e.id}/commands`,
      );
      state.enquiries[index] = applyCommand(
        state.enquiries[index],
        body.command,
        "review",
        { actor: "Test staff", demo: false },
      );
      if (body.command.type === "qualify")
        Object.assign(
          state.enquiries[index],
          evaluateRules(
            trip.activeRules!,
            body.command.group,
            body.command.visa,
          ),
        );
      await route.fulfill({
        json: { revision: state.enquiries[index].revision },
      });
      return;
    }
    await route.fulfill({
      json:
        path === "/api/me"
          ? { id: "STAFF", name: "Test staff", role, local: false }
          : path === "/api/auth/options"
            ? { method: "access" }
            : path === "/api/state"
              ? state
              : path === "/api/settings"
                ? defaultSettings
                : [],
    });
  });
  return { state, commands };
}
test("staff completes first calls inline and follows up in colour order", async ({
  page,
}) => {
  const { state, commands } = await setup(page);
  await page.goto("/");
  const rows = page.locator(".call-row");
  await expect(rows).toHaveCount(8);
  await expect(rows.first()).toContainText("Needs qualification");
  expect(await rows.locator(".priority-number").allTextContents()).toEqual([
    "P1",
    "P2",
    "P3",
    "P4",
    "P4",
    "P5",
    "P6",
  ]);
  const row = page.getByRole("article", { name: /Adam & Sara/ });
  await row
    .getByLabel("Call colour for Adam & Sara", { exact: true })
    .selectOption("orange");
  await row
    .getByLabel("Note for Adam & Sara", { exact: true })
    .fill("Interested. Needs time to choose dates.");
  await expect(page).toHaveURL(/\/$/);
  await row
    .getByRole("button", { name: "Save initial call", exact: true })
    .click();
  await expect(rows).toHaveCount(7);
  expect(commands[0].command.followup).toBeUndefined();
  expect(state.enquiries[1].initialCallAt).toBeTruthy();
  await page.getByRole("button", { name: /^Follow-ups/ }).click();
  await expect(page.getByLabel("Filter colour", { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(7);
  expect(
    await rows.evaluateAll((elements) =>
      elements.map((e) =>
        Array.from(e.classList).find((c) =>
          /^call-(orange|yellow|purple|pink|cyan|blue)$/.test(c),
        ),
      ),
    ),
  ).toEqual([
    "call-orange",
    "call-orange",
    "call-yellow",
    "call-purple",
    "call-pink",
    "call-cyan",
    "call-blue",
  ]);
  await expect(row).toContainText("Initial call done");
  await expect(row).toContainText("Not scheduled");
  await row
    .getByLabel("Note for Adam & Sara", { exact: true })
    .fill("Ready to discuss the deposit.");
  await row.getByRole("button", { name: "Save call", exact: true }).click();
  await expect
    .poll(() => state.enquiries[1].currentNote)
    .toBe("Ready to discuss the deposit.");
  expect(
    state.enquiries[1].activities.filter((a) => a.type === "call"),
  ).toHaveLength(2);
  await page.getByLabel("Filter colour", { exact: true }).selectOption("cyan");
  await expect(rows).toHaveCount(1);
  await page.getByRole("button", { name: /^New enquiries/ }).click();
  await expect(rows).toHaveCount(7); // No hidden colour filter carried into New.
});
test("qualification and standalone note/date updates work without logging calls", async ({
  page,
}) => {
  const { state, commands } = await setup(page);
  await page.goto("/");
  const row = page.getByRole("article", { name: /Amina Noor/ });
  await row.getByText("Edit details", { exact: true }).click();
  await row.getByLabel("Group for Amina Noor").selectOption("friends");
  await row.getByLabel("Schengen for Amina Noor").selectOption("all");
  await row.getByLabel("PAX for Amina Noor").fill("4");
  await row.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(row.locator(".priority-number")).toHaveText("P4");
  await row
    .getByLabel("Note for Amina Noor")
    .fill("Waiting for the first call.");
  await row.getByRole("button", { name: "Save note only" }).click();
  await expect
    .poll(() => state.enquiries[0].currentNote)
    .toBe("Waiting for the first call.");
  expect(state.enquiries[0].initialCallAt).toBeUndefined();
  await page.getByRole("button", { name: /^Follow-ups/ }).click();
  const followup = page.getByRole("article", { name: /Arjun Shah/ });
  await followup
    .getByLabel("Follow-up date for Arjun Shah", { exact: true })
    .fill("2026-11-03T14:30");
  await followup.getByRole("button", { name: "Save follow-up only" }).click();
  await expect.poll(() => commands.at(-1)?.command.type).toBe("task");
  expect(commands.at(-1).command.due).toBe("2026-11-03T10:30:00.000Z");
  await expect(
    followup.getByLabel("Follow-up date for Arjun Shah", { exact: true }),
  ).toHaveValue("2026-11-03T14:30");
  await followup.locator(".call-trip").click();
  await expect(page).toHaveURL(/\/enquiries\/REVIEW-CALL-11/);
});
test("all outcome colours are visible, conversion is derived and layouts fit desktop/tablet/mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page, "manager");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/?list=all");
  await expect(page.locator(".call-row")).toHaveCount(16);
  const backgrounds = await page
    .locator(".call-row")
    .evaluateAll((rows) => [
      ...new Set(rows.map((row) => getComputedStyle(row).backgroundColor)),
    ]);
  expect(backgrounds.length).toBe(9);
  await page.getByLabel("Filter colour", { exact: true }).selectOption("green");
  await expect(page.locator(".call-green")).toHaveCount(1);
  await expect(page.locator(".call-green")).toContainText("Converted");
  await expect(
    page
      .locator(".call-green")
      .getByRole("button", { name: "Save call", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await page.getByRole("button", { name: /^Follow-ups/ }).click();
  await expect(
    page.getByText("Pick up the next conversation.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".call-row")).toHaveCount(6);
  const heights = await page
    .locator(".call-row")
    .evaluateAll((rows) =>
      rows.map((row) => row.getBoundingClientRect().height),
    );
  expect(Math.max(...heights)).toBeLessThan(115);
  await page.screenshot({
    path: ".wrangler/calling-desktop.png",
    fullPage: true,
  });
  for (const width of [1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page
        .locator(".call-row")
        .first()
        .getByRole("button", { name: "Save call", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `.wrangler/calling-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .locator(".call-row")
    .first()
    .getByLabel("Call colour for Nadia & Yusuf", { exact: true })
    .focus();
  await expect(
    page.getByLabel("Call colour for Nadia & Yusuf", { exact: true }),
  ).toBeFocused();
  expect(errors).toEqual([]);
});
test("failed initial call rolls back and retries the exact request key", async ({
  page,
}) => {
  const { state } = await setup(page);
  let fail = true;
  const keys: string[] = [];
  await page.route(
    "**/api/enquiries/REVIEW-CALL-02/commands",
    async (route) => {
      keys.push(route.request().headers()["idempotency-key"]);
      if (fail)
        await route.fulfill({
          status: 503,
          json: { message: "Temporary save failure" },
        });
      else {
        state.enquiries[1] = applyCommand(
          state.enquiries[1],
          route.request().postDataJSON().command,
          "review",
          { actor: "Test staff", demo: false },
        );
        await route.fulfill({ json: { ok: true } });
      }
    },
  );
  await page.goto("/");
  const row = page.getByRole("article", { name: /Adam & Sara/ });
  await row
    .getByLabel("Call colour for Adam & Sara", { exact: true })
    .selectOption("pink");
  await row
    .getByLabel("Note for Adam & Sara", { exact: true })
    .fill("Busy; needs another call.");
  await row
    .getByRole("button", { name: "Save initial call", exact: true })
    .click();
  await expect(page.getByRole("alert").first()).toContainText(
    "Temporary save failure",
  );
  await expect(row).toContainText("Not called");
  fail = false;
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(row).toHaveCount(0);
  expect(keys[0]).toBe(keys[1]);
});
test("manager edits trip priorities in Settings and family changes include friends", async ({
  page,
}) => {
  const { state } = await setup(page, "manager");
  let submitted = structuredClone(defaultRules),
    published = false;
  await page.route("**/api/management/trips/NORWAY/rules", (route) =>
    route.fulfill({
      json: {
        rules: defaultRules,
        activeVersion: 1,
        tripVersion: 1,
        history: [],
      },
    }),
  );
  await page.route(
    "**/api/management/trips/NORWAY/rules/preview",
    async (route) => {
      submitted = route.request().postDataJSON().rules;
      await route.fulfill({
        json: {
          id: "PREVIEW",
          tripId: "NORWAY",
          tripVersion: 1,
          rules: submitted,
          examples: [],
          rows: [],
          expiresAt: new Date(Date.now() + 900000).toISOString(),
        },
      });
    },
  );
  await page.route(
    "**/api/management/trips/NORWAY/rules/publish",
    async (route) => {
      published = true;
      state.trips[0].activeRules = submitted;
      await route.fulfill({ json: { ok: true } });
    },
  );
  await page.goto("/settings?section=priorities");
  await page
    .getByRole("button", { name: "Edit priorities", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Norway · priorities",
    exact: true,
  });
  await expect(dialog.locator(".rule-editor")).toHaveCount(6);
  await dialog
    .getByLabel("Rank family all", { exact: true })
    .selectOption("P3");
  await dialog
    .getByRole("button", { name: "Preview affected enquiries", exact: true })
    .click();
  await expect(
    dialog.getByText("0 enquiries will be recomputed", { exact: true }),
  ).toBeVisible();
  expect(
    submitted.find((r) => r.group === "family" && r.visa === "all")!.rank,
  ).toBe("P3");
  expect(
    submitted.find((r) => r.group === "friends" && r.visa === "all")!.rank,
  ).toBe("P3");
  await dialog.getByRole("checkbox").last().check();
  await dialog
    .getByRole("button", { name: "Publish reviewed rules", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(published).toBe(true);
});

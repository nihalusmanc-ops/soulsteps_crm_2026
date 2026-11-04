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
      if (
        (body.command.type === "qualify" && !state.enquiries[index].override) ||
        body.command.type === "automaticPriority"
      )
        Object.assign(
          state.enquiries[index],
          evaluateRules(
            trip.activeRules!,
            state.enquiries[index].group,
            state.enquiries[index].visa,
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
  await expect(
    rows.first().getByLabel("Set priority for Amina Noor"),
  ).toHaveValue("");
  await expect(
    rows.first().getByLabel("Set priority for Amina Noor"),
  ).toHaveAttribute("title", "Needs qualification (NQ)");
  expect(
    await rows
      .locator(".priority-number")
      .evaluateAll((els) =>
        els
          .filter((e) => (e as unknown as HTMLSelectElement).value)
          .map((e) => (e as unknown as HTMLSelectElement).value),
      ),
  ).toEqual(["P1", "P2", "P3", "P4", "P4", "P5", "P6"]);
  const row = page.getByRole("article", { name: /Adam & Sara/ });
  await row
    .getByRole("button", { name: "Hot for Adam & Sara", exact: true })
    .click();
  await row
    .getByLabel("Note for Adam & Sara", { exact: true })
    .fill("Interested. Needs time to choose dates.");
  await expect(page).toHaveURL(/\/$/);
  await row
    .getByRole("button", { name: "Save initial call", exact: true })
    .click();
  await expect(rows).toHaveCount(7);
  expect(commands[1].command.followup).toBeUndefined();
  expect(state.enquiries[1].initialCallAt).toBeTruthy();
  await page.getByRole("button", { name: /^Follow-ups/ }).click();
  await expect(page.getByLabel("Filter colour", { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(7);
  await expect
    .poll(() =>
      rows.evaluateAll((elements) =>
        elements.map((e) =>
          Array.from(e.classList).find((c) =>
            /^call-(orange|yellow|purple|pink|cyan|blue)$/.test(c),
          ),
        ),
      ),
    )
    .toEqual([
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
  await expect
    .poll(
      () =>
        state.enquiries[1].activities.filter((a) => a.type === "call").length,
    )
    .toBe(2);
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
  await row.getByLabel("Travellers for Amina Noor").fill("4");
  await row.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(row.getByLabel("Set priority for Amina Noor")).toHaveValue("P4");
  await row.getByLabel("Set priority for Amina Noor").selectOption("P1");
  await expect.poll(() => state.enquiries[0].rank).toBe("P1");
  await row
    .getByLabel("Note for Amina Noor")
    .fill("Waiting for the first call.");

  await expect
    .poll(() => state.enquiries[0].currentNote)
    .toBe("Waiting for the first call.");
  expect(state.enquiries[0].initialCallAt).toBeUndefined();
  await page.getByRole("button", { name: /^Follow-ups/ }).click();
  const followup = page.getByRole("article", { name: /Arjun Shah/ });
  await followup
    .getByLabel("Follow-up date for Arjun Shah", { exact: true })
    .fill("2026-11-03T14:30");

  await expect.poll(() => commands.at(-1)?.command.type).toBe("setFollowup");
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
  expect(Math.max(...heights)).toBeLessThan(150);
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
    .getByRole("button", { name: "Hot for Nadia & Yusuf", exact: true })
    .focus();
  await expect(
    page.getByRole("button", {
      name: "Hot for Nadia & Yusuf",
      exact: true,
    }),
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
    .getByRole("button", { name: /Call back .* busy for Adam & Sara/ })
    .click();
  await expect(page.getByRole("alert").first()).toContainText(
    "Temporary save failure",
  );
  await expect(row).toContainText("Not called");
  fail = false;
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(row).toHaveClass(/call-pink/);
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
test("combines received date and manual priority and sorts headings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const { state } = await setup(page);
  state.enquiries.forEach((e, i) => {
    e.createdAt = new Date(
      Date.now() - (i < 4 ? 2 : 20) * 86400000,
    ).toISOString();
  });
  await page.goto("/?list=all");
  await page.getByLabel("Filter received date").selectOption("7");
  await expect(page.locator(".call-row")).toHaveCount(4);
  await page.getByLabel("Filter priority", { exact: true }).selectOption("P1");
  await expect(page.locator(".call-row")).toHaveCount(1);
  await page.getByLabel("Filter priority", { exact: true }).selectOption("");
  await expect(page.locator(".call-row")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Sort by Customer / details", exact: true })
    .click();
  await expect(page).toHaveURL(/direction=asc/);
  const names = ["Adam & Sara", "Amina Noor", "Maya Joseph", "Omar & Lina"];
  await expect
    .poll(() => page.locator(".customer-link").allTextContents())
    .toEqual(names);
  await page
    .getByRole("button", { name: "Sort by Customer / details", exact: true })
    .click();
  await expect(page).toHaveURL(/direction=desc/);
  await expect
    .poll(() => page.locator(".customer-link").allTextContents())
    .toEqual([...names].reverse());
  await page.getByLabel("Filter received date").selectOption("30");
  await expect(page.locator(".call-row")).toHaveCount(16);
});

test("background saves update immediately without banners, fading or moving rows", async ({
  page,
}) => {
  const { state } = await setup(page);
  let release!: () => void;
  let received!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route(
    "**/api/enquiries/REVIEW-CALL-09/commands",
    async (route) => {
      received();
      await held;
      const index = state.enquiries.findIndex((e) => e.id === "REVIEW-CALL-09");
      state.enquiries[index] = applyCommand(
        state.enquiries[index],
        route.request().postDataJSON().command,
        "review",
        { actor: "Test staff", demo: false },
      );
      await route.fulfill({
        json: { revision: state.enquiries[index].revision },
      });
    },
  );
  await page.goto("/?list=followups");
  const row = page.getByRole("article", { name: /Nadia & Yusuf/ });
  await expect(row).toBeVisible();
  const note = row.getByLabel("Note for Nadia & Yusuf", { exact: true });
  await note.fill("Keep this unfinished note while changing colour.");
  const before = await row.boundingBox();
  const names = await page.locator(".customer-link").allTextContents();
  const dot = row.getByRole("button", {
    name: "No answer for Nadia & Yusuf",
    exact: true,
  });
  await dot.click();
  await started;
  await expect(row).toHaveClass(/call-cyan/);
  await expect(dot).toHaveCSS("opacity", "1");
  await expect(page.getByText("Saving changes", { exact: false })).toHaveCount(
    0,
  );
  expect(await row.boundingBox()).toEqual(before);
  expect(await page.locator(".customer-link").allTextContents()).toEqual(names);
  await expect(note).toHaveValue(
    "Keep this unfinished note while changing colour.",
  );
  release();
  await expect(page.locator("#main-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(dot).toBeEnabled();
  expect(await row.boundingBox()).toEqual(before);
  expect(await page.locator(".customer-link").allTextContents()).toEqual(names);
  await expect(page.locator(".toast")).toHaveCount(0);
});

test("notes and dates autosave across tabs without recording a call, and each tab remembers filters", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.goto("/?list=new");
  const row = page.getByRole("article", { name: /Adam & Sara/ });
  await row
    .getByLabel("Note for Adam & Sara", { exact: true })
    .fill("Autosaved across tabs");
  await page.getByRole("button", { name: /^Follow-ups/ }).click();
  await expect
    .poll(() => state.enquiries[1].currentNote)
    .toBe("Autosaved across tabs");
  expect(state.enquiries[1].initialCallAt).toBeUndefined();
  await page.getByLabel("Filter priority", { exact: true }).selectOption("P1");
  await page.getByLabel("Filter received date").selectOption("7");
  await expect(page).toHaveURL(/period=7/);
  await page.getByRole("button", { name: /^All enquiries/ }).click();
  await expect(page.getByLabel("Filter priority", { exact: true })).toHaveValue(
    "",
  );
  await page.getByRole("button", { name: /^Follow-ups/ }).click();
  await expect(page.getByLabel("Filter priority", { exact: true })).toHaveValue(
    "P1",
  );
  await expect(page.getByLabel("Filter received date")).toHaveValue("7");
  await page.getByRole("button", { name: /^New enquiries/ }).click();
  await expect(
    row.getByLabel("Note for Adam & Sara", { exact: true }),
  ).toHaveValue("Autosaved across tabs");
  await row
    .getByLabel("Follow-up date for Adam & Sara", { exact: true })
    .fill("2026-11-06T14:30");
  await expect
    .poll(() =>
      state.enquiries[1].tasks
        .filter((t) => t.status === "pending")
        .map((t) => t.due),
    )
    .toEqual(["2026-11-06T10:30:00.000Z"]);
  expect(state.enquiries[1].initialCallAt).toBeUndefined();
  await row
    .getByRole("button", { name: "Hot for Adam & Sara", exact: true })
    .click();
  await expect.poll(() => state.enquiries[1].callColour).toBe("orange");
  await expect(row).toContainText("Not called");
  expect(state.enquiries[1].activities.some((a) => a.type === "call")).toBe(
    false,
  );
  await row
    .getByLabel("Follow-up date for Adam & Sara", { exact: true })
    .fill("2026-11-07T15:00");
  await row
    .getByLabel("Follow-up date for Adam & Sara", { exact: true })
    .press("Enter");
  await expect
    .poll(() =>
      state.enquiries[1].tasks
        .filter((t) => t.status === "pending")
        .map((t) => t.due),
    )
    .toEqual(["2026-11-07T11:00:00.000Z"]);
  expect(state.enquiries[1].initialCallAt).toBeUndefined();
  await row.getByLabel("Note for Adam & Sara", { exact: true }).fill("");
  await expect.poll(() => state.enquiries[1].currentNote).toBe("");
});

test("rapid colour changes stay ordered while a different enquiry saves independently", async ({
  page,
}) => {
  const { state } = await setup(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  const revisions: number[] = [];
  await page.route(
    "**/api/enquiries/REVIEW-CALL-02/commands",
    async (route) => {
      const body = route.request().postDataJSON();
      revisions.push(body.revision);
      requests++;
      if (requests === 1) await held;
      expect(body.revision).toBe(state.enquiries[1].revision);
      state.enquiries[1] = applyCommand(
        state.enquiries[1],
        body.command,
        "review",
        { actor: "Test staff", demo: false },
      );
      await route.fulfill({ json: { revision: state.enquiries[1].revision } });
    },
  );
  await page.goto("/?list=new");
  const row = page.getByRole("article", { name: /Adam & Sara/ });
  await row
    .getByRole("button", { name: "Hot for Adam & Sara", exact: true })
    .click();
  await expect.poll(() => requests).toBe(1);
  await row
    .getByRole("button", { name: "No answer for Adam & Sara", exact: true })
    .click();
  await row
    .getByRole("button", { name: "Hot for Adam & Sara", exact: true })
    .click();
  const other = page.getByRole("article", { name: /Omar & Lina/ });
  await other.getByLabel("Set priority for Omar & Lina").selectOption("P1");
  await expect.poll(() => state.enquiries[2].rank).toBe("P1");
  await expect(row).toHaveClass(/call-orange/);
  expect(requests).toBe(1);
  release();
  await expect.poll(() => requests).toBe(3);
  await expect(page.locator("#main-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(revisions).toEqual([0, 1, 2]);
  expect(state.enquiries[1].callColour).toBe("orange");
  expect(state.enquiries[1].initialCallAt).toBeUndefined();
});

test("red cancels pending follow-ups and Undo restores the enquiry without logging a call", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.goto("/?list=followups");
  const row = page.getByRole("article", { name: /Nadia & Yusuf/ });
  const initial = state.enquiries[8].initialCallAt;
  await row
    .getByRole("button", {
      name: "Disqualified for Nadia & Yusuf",
      exact: true,
    })
    .click();
  await expect(row).toHaveCount(0);
  await expect.poll(() => state.enquiries[8].stage).toBe("LOST");
  expect(
    state.enquiries[8].tasks.filter((t) => t.status === "pending"),
  ).toHaveLength(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row).toBeVisible();
  await expect.poll(() => state.enquiries[8].stage).toBe("QUALIFYING");
  expect(
    state.enquiries[8].tasks.filter((t) => t.status === "pending"),
  ).toHaveLength(1);
  expect(state.enquiries[8].initialCallAt).toBe(initial);
  await page.getByRole("button", { name: /^All enquiries/ }).click();
  const closed = page.getByRole("article", { name: /Daniel Cole/ });
  await closed
    .getByRole("button", { name: "Reopen enquiry", exact: true })
    .click();
  await expect.poll(() => state.enquiries[14].stage).toBe("QUALIFYING");
});

test("manual priorities return to trip rules and the colour guide explains compact controls", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.goto("/?list=new");
  const row = page.getByRole("article", { name: /Adam & Sara/ });
  const rank = row.getByLabel("Set priority for Adam & Sara");
  await rank.selectOption("P6");
  await expect.poll(() => state.enquiries[1].rank).toBe("P6");
  await expect(row.locator(".call-priority-source")).toHaveText("Manual");
  await rank.selectOption("auto");
  await expect.poll(() => state.enquiries[1].rank).toBe("P1");
  expect(state.enquiries[1].override).toBeUndefined();
  await expect(row.locator(".call-priority-source")).toHaveText("Auto");
  await page.getByRole("button", { name: "Colour guide", exact: true }).click();
  await expect(page.locator("#calling-legend")).toContainText(
    "NQ = Needs qualification",
  );
  await expect(page.locator("#calling-legend")).toContainText(
    "Use the save icon to record a call attempt",
  );
});

test("status filters find uncalled enquiries and due filters distinguish overdue and unscheduled", async ({
  page,
}) => {
  const { state } = await setup(page);
  state.enquiries.forEach((e) => {
    e.tasks = [];
  });
  state.enquiries[8].tasks = [
    {
      id: "OVERDUE",
      type: "Follow-up",
      due: new Date(Date.now() - 2 * 86400000).toISOString(),
      status: "pending",
      note: "Fictional overdue",
    },
  ];
  await page.goto("/?list=all");
  await page.getByLabel("Filter enquiry status").selectOption("new");
  await expect(page.locator(".call-row")).toHaveCount(8);
  await expect(
    page.getByText("Showing 8 of 16", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Filter priority", { exact: true }).selectOption("P1");
  await expect(page.locator(".call-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Remove P1 filter", exact: true })
    .click();
  await expect(page.locator(".call-row")).toHaveCount(8);
  await page.getByRole("button", { name: /^Follow-ups/ }).click();
  await page.getByRole("button", { name: /^Overdue/ }).click();
  await expect(page.locator(".call-row")).toHaveCount(1);
  await expect(page.locator(".call-row")).toContainText("2 days overdue");
  await page.getByRole("button", { name: /^Not scheduled/ }).click();
  await expect(page.locator(".call-row")).toHaveCount(5);
});

test("server refresh updates untouched notes but preserves and flags an active draft", async ({
  page,
}) => {
  const { state, commands } = await setup(page);
  await page.goto("/?list=followups");
  const row = page.getByRole("article", { name: /Nadia & Yusuf/ }),
    note = row.getByLabel("Note for Nadia & Yusuf", { exact: true });
  state.enquiries[8].currentNote = "A newer note from another staff member";
  state.enquiries[8].revision++;
  const other = page.getByRole("article", { name: /Arjun Shah/ });
  await other
    .getByRole("button", { name: "Hot for Arjun Shah", exact: true })
    .click();
  await expect(note).toHaveValue("A newer note from another staff member");
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route(
    "**/api/enquiries/REVIEW-CALL-11/commands",
    async (route) => {
      started = true;
      await held;
      state.enquiries[10] = applyCommand(
        state.enquiries[10],
        route.request().postDataJSON().command,
        "review",
        { actor: "Test staff", demo: false },
      );
      await route.fulfill({ json: { revision: state.enquiries[10].revision } });
    },
  );
  await other
    .getByRole("button", { name: "No answer for Arjun Shah", exact: true })
    .click();
  await expect.poll(() => started).toBe(true);
  await note.fill("Keep my unfinished draft");
  state.enquiries[8].currentNote = "Another new saved note";
  state.enquiries[8].revision++;
  release();
  await expect(row.locator(".calling-draft-conflict")).toContainText(
    "Your draft is kept",
  );
  await expect(note).toHaveValue("Keep my unfinished draft");
  await page.waitForTimeout(900);
  expect(state.enquiries[8].currentNote).toBe("Another new saved note");
  expect(commands.filter((c) => c.command.type === "setNote")).toHaveLength(0);
  await row.getByRole("button", { name: "Use latest", exact: true }).click();
  await expect(note).toHaveValue("Another new saved note");
});

test("follow-up shortcuts autosave and controls remain visible at narrow widths and while scrolling", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/?list=followups");
  const row = page.getByRole("article", { name: /Arjun Shah/ });
  await row.getByRole("button", { name: "Tomorrow", exact: true }).click();
  await expect
    .poll(
      () =>
        state.enquiries[10].tasks.filter((t) => t.status === "pending").length,
    )
    .toBe(1);
  await expect(row).toContainText("Tomorrow,");
  await row.getByRole("button", { name: "Clear", exact: true }).click();
  await expect
    .poll(
      () =>
        state.enquiries[10].tasks.filter((t) => t.status === "pending").length,
    )
    .toBe(0);
  for (const width of [1600, 1280, 1101, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const first = page.locator(".call-row").first();
    const bounds = await first.boundingBox();
    const save = await first.locator(".call-save-icon").boundingBox();
    const date = await first.locator(".date-time-field").boundingBox();
    expect(save!.x + save!.width).toBeLessThanOrEqual(
      bounds!.x + bounds!.width,
    );
    expect(date!.width).toBeGreaterThan(190);
    const dots = await first
      .locator(".call-colour-dot")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(new Set(dots.slice(0, 4)).size).toBe(1);
    expect(new Set(dots.slice(4)).size).toBe(1);
    expect(dots[4]).toBeGreaterThan(dots[0]);
  }
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 500));
  const controls = await page.locator(".calling-controls").boundingBox(),
    columns = await page.locator(".calling-columns").boundingBox();
  expect(controls!.y).toBeCloseTo(0, 0);
  expect(columns!.y).toBeCloseTo(controls!.height, 0);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(
    page.getByLabel("Filter priority", { exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(
    page.getByLabel("Filter priority", { exact: true }),
  ).toBeVisible();
});

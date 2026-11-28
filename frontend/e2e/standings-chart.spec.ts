import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The Standings page's championship chart when its data doesn't arrive. Before, a failed load (a server error, or
// the 5 s timeout in lib/api-client.ts) left "Loading progression data..." on screen for good, with no way to try
// again but reloading. Now it says the chart couldn't load and offers a retry; a season whose round-by-round
// standings come back empty says that. 2026 after round 21 from the saved fixtures.

const PROGRESSION = "**/api/v1/standings/2026/progression";
const CHART = 'svg[aria-label="Championship points progression"]';

let errors: string[] = [];
// the browser logs a failed request as a console error; the tests below fail the chart's call on purpose, and any
// other failed request (a missing fixture, a blocked host) still counts
const FAILED_ON_PURPOSE = /\/api\/v1\/standings\/2026\/progression$/;
test.beforeEach(async ({ context, baseURL, page }) => {
  errors = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    if (msg.text().startsWith("Failed to load resource") && FAILED_ON_PURPOSE.test(msg.location().url)) return;
    errors.push(msg.text());
  });
  const host = new URL(baseURL ?? "http://127.0.0.1").hostname;
  await context.route(
    (url) => /^https?:$/.test(url.protocol) && url.hostname !== host,
    (route) => route.abort("blockedbyclient"),
  );
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function savedProgression() {
  const file = path.join(test.info().project.testDir, "fixtures/api/standings-2026-progression.json");
  return JSON.parse(await readFile(file, "utf8"));
}

/** Fails the first call with a 503, then serves `body`. Returns a counter of the calls. */
async function failFirst(page: Page, body: unknown) {
  const calls = { n: 0 };
  await page.route(PROGRESSION, async (route) => {
    calls.n += 1;
    if (calls.n === 1) return route.fulfill({ status: 503, json: { detail: "busy" } });
    return route.fulfill({ json: body });
  });
  return calls;
}

test("the chart draws from the saved progression", async ({ page }) => {
  await page.goto("/standings");
  await expect(page.locator(CHART)).toBeVisible();
  await expect(page.getByText("Couldn't load the championship chart.")).toHaveCount(0);
  await expect(page.getByText("Loading progression data...")).toHaveCount(0);
});

test("a failed chart load says so and retries, instead of loading for good", async ({ page }) => {
  const calls = await failFirst(page, await savedProgression());
  await page.goto("/standings");
  // the tables still load
  await expect(page.locator("a.standings-row-driver")).toHaveCount(25);
  await expect(page.getByText("Couldn't load the championship chart.")).toBeVisible();
  await expect(page.getByText("Loading progression data...")).toHaveCount(0);
  await expect(page.locator(CHART)).toHaveCount(0);

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator(CHART)).toBeVisible();
  await expect(page.getByText("Couldn't load the championship chart.")).toHaveCount(0);
  expect(calls.n).toBe(2);
});

test("a season with no round-by-round standings says so", async ({ page }) => {
  await page.route(PROGRESSION, (route) => route.fulfill({ json: [] }));
  await page.goto("/standings");
  await expect(page.getByText("No round-by-round standings for 2026 yet.")).toBeVisible();
  await expect(page.getByText("Loading progression data...")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
});

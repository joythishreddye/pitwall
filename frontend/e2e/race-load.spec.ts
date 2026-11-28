import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// When a race page's data doesn't arrive, the page says why. A race the API doesn't have (404) is "not found"; a
// failed load (a server error, or the 5 s timeout in lib/api-client.ts) says it couldn't load and offers a retry.
// Before, every failure read "Race not found.", with no way to try again but reloading (seen on production
// 2026-11-27: both calls aborted on a first load). Brazil 2026 (race 193): the saved race is filled from the file,
// never fetched, since a page route wins over the context's host guard below.

let errors: string[] = [];
// the browser logs a failed request as a console error; the tests below fail the race's two calls on purpose, and
// any other failed request (a missing fixture, a blocked host) still counts
const FAILED_ON_PURPOSE = /\/api\/v1\/races\/193(\/strategy)?$/;
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

async function savedRace() {
  const file = path.join(test.info().project.testDir, "fixtures/api/races-193.json");
  return JSON.parse(await readFile(file, "utf8"));
}

// One stop for Norris (the saved race's winner), so a loaded Pit Stops tab has a row to show
const STOPS = [
  {
    driver: { id: 660, ref: "norris", forename: "Lando", surname: "Norris", code: "NOR", number: "1", nationality: "British" },
    pit_stops: [{ stop_number: 1, lap: 23, duration_ms: 24100 }],
  },
];

type Fail = "server error" | "timeout";

/** Serves `body` from the second call on, after `delayMs`; the first call fails as asked. Returns a counter of the
 * calls and a promise that settles once the first (failed) answer has reached the page. */
async function failFirst(page: Page, url: string, fail: Fail, body: unknown, delayMs = 0) {
  const calls = { n: 0 };
  let failed!: () => void;
  const firstFailed = new Promise<void>((resolve) => (failed = resolve));
  await page.route(url, async (route) => {
    calls.n += 1;
    if (calls.n > 1) {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return route.fulfill({ json: body });
    }
    if (fail === "timeout") await route.abort("timedout");
    else await route.fulfill({ status: 503, json: { detail: "busy" } });
    failed();
  });
  return { calls, firstFailed };
}

async function pitStopsShow(page: Page) {
  await page.getByRole("tab", { name: "Pit Stops" }).click();
  await expect(page.locator(".pit-row")).toHaveCount(1);
  await expect(page.getByText(/No pit stop/)).toHaveCount(0);
}

async function failsThenLoads(page: Page, fail: Fail) {
  // both calls fail, as on production: Retry brings back the race and its pit stops
  const race = await failFirst(page, "**/api/v1/races/193", fail, await savedRace());
  const stops = await failFirst(page, "**/api/v1/races/193/strategy", fail, STOPS);
  await page.goto("/races/193");
  await expect(page.getByText("Couldn't load this race.")).toBeVisible();
  await expect(page.getByText("Race not found.")).toHaveCount(0);
  // both failures have landed, so Retry knows the pit stops failed too
  await Promise.all([race.firstFailed, stops.firstFailed]);

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Brazilian Grand Prix" })).toBeVisible();
  await expect(page.locator("a.result-row")).toHaveCount(22);
  await pitStopsShow(page);
  expect(race.calls.n).toBe(2);
  expect(stops.calls.n).toBe(2);
}

test("a server error says the race couldn't load, and Retry loads it", async ({ page }) => {
  await failsThenLoads(page, "server error");
});

test("a request that times out says the race couldn't load, and Retry loads it", async ({ page }) => {
  await failsThenLoads(page, "timeout");
});

test("pit stops that fail to load say so, and Retry loads them", async ({ page }) => {
  // the second answer takes a second, so the tab is seen while the stops reload
  const stops = await failFirst(page, "**/api/v1/races/193/strategy", "server error", STOPS, 1_000);
  await page.goto("/races/193");
  await expect(page.locator("a.result-row")).toHaveCount(22);
  await page.getByRole("tab", { name: "Pit Stops" }).click();
  // not "No pit stop ...", which would say the race has none
  await expect(page.getByText("Couldn't load the pit stops.")).toBeVisible();
  await expect(page.getByText(/No pit stop/)).toHaveCount(0);

  await page.getByRole("button", { name: "Retry" }).click();
  // while they reload, the tab says so, and never that the race has no pit stops
  await expect(page.getByRole("status", { name: "Loading pit stops" })).toBeVisible();
  await expect(page.getByText(/No pit stop/)).toHaveCount(0);
  await expect(page.locator(".pit-row")).toHaveCount(1);
  expect(stops.calls.n).toBe(2);
});

// 193.5 gets a 422 from the API, and 3000000000 (past races.id's 32-bit range) a 500 (both checked on production,
// 2026-11-27), so asking would only offer a Retry that can never work
for (const id of ["193.5", "3000000000"]) {
  test(`an id that can't name a race (${id}) is not found, with no request and nothing to retry`, async ({ page }) => {
    let calls = 0;
    await page.route("**/api/v1/races/**", (route) => {
      calls += 1;
      return route.fulfill({ status: 500, json: { detail: "not a race id" } });
    });
    await page.goto(`/races/${id}`);
    await expect(page.getByText("Race not found.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
    expect(calls).toBe(0);
  });
}

test("a race the API doesn't have is not found, with nothing to retry", async ({ page }) => {
  await page.route("**/api/v1/races/193", (route) =>
    route.fulfill({ status: 404, json: { detail: "Race 193 not found" } }),
  );
  await page.goto("/races/193");
  await expect(page.getByText("Race not found.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
});

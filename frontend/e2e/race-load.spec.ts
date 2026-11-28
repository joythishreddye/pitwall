import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// When a race page's data doesn't arrive, the page says why. A race the API doesn't have (404) is "not found"; a
// failed load (a server error, or the 5 s timeout in lib/api-client.ts) says it couldn't load and offers a retry.
// Before, every failure read "Race not found.", with no way to try again but reloading (seen on production
// 2026-11-27: both calls aborted on a first load). Brazil 2026 (race 193): the saved race is filled from the file,
// never fetched, since a page route wins over the context's host guard below.

let errors: string[] = [];
// the browser logs a failed request as a console error; the tests below fail requests on purpose
const FAILED_REQUEST = /^Failed to load resource/;
test.beforeEach(async ({ context, baseURL, page }) => {
  errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  const host = new URL(baseURL ?? "http://127.0.0.1").hostname;
  await context.route(
    (url) => /^https?:$/.test(url.protocol) && url.hostname !== host,
    (route) => route.abort("blockedbyclient"),
  );
});
test.afterEach(() => {
  expect(errors.filter((e) => !FAILED_REQUEST.test(e))).toEqual([]);
});

async function savedRace() {
  const file = path.join(test.info().project.testDir, "fixtures/api/races-193.json");
  return JSON.parse(await readFile(file, "utf8"));
}

async function failsThenLoads(page: Page, fail: "server error" | "timeout") {
  const saved = await savedRace();
  let calls = 0;
  await page.route("**/api/v1/races/193", (route) => {
    calls += 1;
    if (calls > 1) return route.fulfill({ json: saved });
    return fail === "timeout" ? route.abort("timedout") : route.fulfill({ status: 503, json: { detail: "busy" } });
  });
  await page.goto("/races/193");
  await expect(page.getByText("Couldn't load this race.")).toBeVisible();
  await expect(page.getByText("Race not found.")).toHaveCount(0);

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Brazilian Grand Prix" })).toBeVisible();
  await expect(page.locator("a.result-row")).toHaveCount(22);
  expect(calls).toBe(2);
}

test("a server error says the race couldn't load, and Retry loads it", async ({ page }) => {
  await failsThenLoads(page, "server error");
});

test("a request that times out says the race couldn't load, and Retry loads it", async ({ page }) => {
  await failsThenLoads(page, "timeout");
});

test("a race the API doesn't have is not found, with nothing to retry", async ({ page }) => {
  await page.route("**/api/v1/races/193", (route) =>
    route.fulfill({ status: 404, json: { detail: "Race 193 not found" } }),
  );
  await page.goto("/races/193");
  await expect(page.getByText("Race not found.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
});

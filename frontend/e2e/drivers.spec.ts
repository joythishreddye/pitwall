import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The drivers list and a driver's page, which no other test opens. From the saved fixtures: 2026 after round 21
// (25 drivers, Antonelli leading) and Antonelli's profile and 2026 results (21 rounds).
// When a driver's data doesn't arrive, his page says why. A driver the API doesn't have (404) is "not found"; a
// failed load says it couldn't load and offers a retry, and so do his season's results. Before, any failure read
// "DRIVER NOT FOUND", and failed results read "NO RESULTS FOR 2026 SEASON", with no way to try again but reloading.
// His results fit the screen at every width (the three projects, plus 360 and 375 px phones): before, on a phone the
// race names shrank to nothing and the points ran off the screen.

let errors: string[] = [];
// the browser logs a failed request as a console error; the tests below fail a driver's calls on purpose, and any
// other failed request (a missing fixture, a blocked host) still counts
const FAILED_ON_PURPOSE = /\/api\/v1\/drivers\/(antonelli|nobody)(\/results)?(\?.*)?$/;
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

async function saved(file: string) {
  return JSON.parse(await readFile(path.join(test.info().project.testDir, "fixtures/api", file), "utf8"));
}

/** Fails the first call to `url` with a 503, then serves `body`. Returns a counter of the calls. */
async function failFirst(page: Page, url: string, body: unknown) {
  const calls = { n: 0 };
  await page.route(url, async (route) => {
    calls.n += 1;
    if (calls.n === 1) return route.fulfill({ status: 503, json: { detail: "busy" } });
    return route.fulfill({ json: body });
  });
  return calls;
}

async function showsAntonelli(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ANTONELLI");
  // the career tiles: 1 title, and the rates worked out from 9 wins, 19 podiums and 8 poles in 45 races
  // (a tile's number shows 0 until the tile is revealed, so this waits for the 1)
  await expect(page.getByText("Championships", { exact: true }).locator("..")).toHaveText(/^Championships\s*1$/);
  await expect(page.getByText("20.0% of races")).toBeVisible();
  await expect(page.getByText("42.2% of races")).toBeVisible();
  await expect(page.getByText("17.8% of races")).toBeVisible();
}

test("the drivers page lists the season's drivers, the leader first, each opening his page", async ({ page }) => {
  await page.goto("/drivers");
  await expect(page.getByText("25 DRIVERS // 2026 CHAMPIONSHIP")).toBeVisible();
  const cards = page.locator(".drivers-grid a");
  await expect(cards).toHaveCount(25);
  await expect(cards.first()).toContainText("Antonelli");
  await expect(cards.first()).toHaveAttribute("href", "/drivers/antonelli");

  await cards.first().click();
  await expect(page).toHaveURL(/\/drivers\/antonelli$/);
  await showsAntonelli(page);
});

test("a driver's page shows his name, career numbers and the season's results", async ({ page }) => {
  await page.goto("/drivers/antonelli");
  await showsAntonelli(page);
  await expect(page.getByRole("heading", { name: "2026 Results" })).toBeVisible();
  const rows = page.locator("a.result-row");
  await expect(rows).toHaveCount(21);
  await expect(rows.first()).toContainText("Las Vegas Grand Prix");
  await expect(rows.first()).toHaveAttribute("href", "/races/194");
});

test("a driver the API doesn't have reads not found, with nothing to retry", async ({ page }) => {
  await page.route("**/api/v1/drivers/nobody", (route) => route.fulfill({ status: 404, json: { detail: "no" } }));
  await page.route("**/api/v1/drivers/nobody/results**", (route) =>
    route.fulfill({ status: 404, json: { detail: "no" } }),
  );
  await page.goto("/drivers/nobody");
  await expect(page.getByText("DRIVER NOT FOUND")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(page.locator("main").getByRole("link", { name: "Drivers", exact: true })).toHaveAttribute(
    "href",
    "/drivers",
  );
});

test("a failed driver load says so and retries, instead of reading not found", async ({ page }) => {
  const calls = await failFirst(page, "**/api/v1/drivers/antonelli", await saved("drivers-antonelli.json"));
  await page.goto("/drivers/antonelli");
  await expect(page.getByText("Couldn't load this driver.")).toBeVisible();
  await expect(page.getByText("DRIVER NOT FOUND")).toHaveCount(0);

  await page.getByRole("button", { name: "Retry" }).click();
  await showsAntonelli(page);
  await expect(page.locator("a.result-row")).toHaveCount(21);
  expect(calls.n).toBe(2);
});

test("failed results say so and retry, instead of reading no results", async ({ page }) => {
  const calls = await failFirst(
    page,
    "**/api/v1/drivers/antonelli/results**",
    await saved("drivers-antonelli-results-2026.json"),
  );
  await page.goto("/drivers/antonelli");
  await showsAntonelli(page);
  await expect(page.getByText("Couldn't load the results.")).toBeVisible();
  await expect(page.getByText(/NO RESULTS FOR/)).toHaveCount(0);

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator("a.result-row")).toHaveCount(21);
  await expect(page.getByText("Couldn't load the results.")).toHaveCount(0);
  expect(calls.n).toBe(2);
});

/** His page fits the screen: no sideways scroll, every race's name has room, nothing in a row runs past its edge,
 * and each row's date shows once (under the name below 1024 px, in its own column from 1024 px). */
async function resultsFit(page: Page) {
  await page.goto("/drivers/antonelli");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const rows = page.locator("a.result-row");
  await expect(rows).toHaveCount(21);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // the name's own box (which clipping can shrink), not its text: room for "Las Vegas Gra..." at least
  for (const row of await rows.all()) {
    const width = await row.locator(".result-race").evaluate((el) => el.clientWidth);
    expect(width).toBeGreaterThan(100);
    const spill = await row.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(spill).toBeLessThanOrEqual(0);
  }

  // Las Vegas, the newest row, ran on 22 Nov
  const first = rows.first();
  const date = first.getByText("22 Nov", { exact: true });
  await expect(date).toHaveCount(2); // one for each layout, one of them hidden
  await expect(date.filter({ visible: true })).toHaveCount(1);
  const name = (await first.locator(".result-race").boundingBox())!;
  const shown = (await date.filter({ visible: true }).boundingBox())!;
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    expect(shown.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
  } else {
    expect(shown.x).toBeGreaterThanOrEqual(name.x + name.width);
  }
  await expect(page.getByText("DATE", { exact: true }).filter({ visible: true })).toHaveCount(
    (page.viewportSize()?.width ?? 0) < 1024 ? 0 : 1,
  );
}

test("his results fit the screen, every race's name has room, and each date shows once", async ({ page }) => {
  await resultsFit(page);
});

// Most Android phones are 360 px wide, the iPhone SE and mini 375
for (const width of [360, 375]) {
  test.describe(`on a ${width} px phone`, () => {
    test.use({ viewport: { width, height: 800 } });
    test("his results fit the screen, every race's name has room, and each date shows once", async ({ page }) => {
      await resultsFit(page);
    });
  });
}

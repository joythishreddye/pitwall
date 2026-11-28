import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

// A race page's Pit Stops tab with no stops says why. Before, every race without stops read "No pit stop telemetry
// ... only available for races from the 2022 season onwards", even a 2026 race (found live 2026-11-27: Brazil 2026's
// stops aren't in the database, so the API answers []) and a race that hasn't been run. From the saved fixtures:
// Brazil 2026 (race 193, run, no stops) and Qatar 2026 (race 195, not run yet).

const RESULTS_PENDING = "Pit stops show here once the race's results are in.";

async function savedBrazil() {
  const file = path.join(test.info().project.testDir, "fixtures/api/races-193.json");
  return JSON.parse(await readFile(file, "utf8"));
}

let errors: string[] = [];
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
  expect(errors).toEqual([]);
});

test("a 2026 race without stops says PitWall doesn't have them, not that only 2022 onwards has data", async ({ page }) => {
  await page.goto("/races/193");
  await expect(page.locator("a.result-row")).toHaveCount(22);
  await page.getByRole("tab", { name: "Pit Stops" }).click();
  await expect(page.getByText("PitWall doesn't have this race's pit stop times.")).toBeVisible();
  await expect(page.getByText(/2022 season/)).toHaveCount(0);
});

test("a race that hasn't been run says its stops show once its results are in", async ({ page }) => {
  await page.goto("/races/195");
  await expect(page.getByRole("heading", { level: 1, name: "Qatar Grand Prix" })).toBeVisible();
  await page.getByRole("tab", { name: "Pit Stops" }).click();
  await expect(page.getByText(RESULTS_PENDING)).toBeVisible();
  await expect(page.getByText(/2022 season/)).toHaveCount(0);
});

test("a race that has been run but isn't loaded yet doesn't say the race is still to come", async ({ page }) => {
  // the hours between the flag and the next data refresh: Brazil 2026 is in the past, served with no results
  const race = { ...(await savedBrazil()), results: [] };
  await page.route("**/api/v1/races/193", (route) => route.fulfill({ json: race }));
  await page.goto("/races/193");
  await expect(page.getByText("Results for this race are not yet available.")).toBeVisible();
  await page.getByRole("tab", { name: "Pit Stops" }).click();
  await expect(page.getByText(RESULTS_PENDING)).toBeVisible();
});

test("a race from before 2022 still says pit stop times start in 2022", async ({ page }) => {
  // the saved Brazil race, served as 2021's: a page route fills it from the file and wins over the host guard
  const race = { ...(await savedBrazil()), season: 2021 };
  await page.route("**/api/v1/races/193", (route) => route.fulfill({ json: race }));
  await page.goto("/races/193");
  await expect(page.locator("a.result-row")).toHaveCount(22);
  await page.getByRole("tab", { name: "Pit Stops" }).click();
  await expect(page.getByText(/only available for races from the 2022 season onwards/)).toBeVisible();
});

test("a race from before 2022 with no results says stop times start in 2022, not that they come later", async ({ page }) => {
  // stop times are only loaded from 2022, so an older race's stops never arrive, results or not
  const race = { ...(await savedBrazil()), season: 2021, results: [] };
  await page.route("**/api/v1/races/193", (route) => route.fulfill({ json: race }));
  await page.goto("/races/193");
  await expect(page.getByText("Results for this race are not yet available.")).toBeVisible();
  await page.getByRole("tab", { name: "Pit Stops" }).click();
  await expect(page.getByText(/only available for races from the 2022 season onwards/)).toBeVisible();
  await expect(page.getByText(RESULTS_PENDING)).toHaveCount(0);
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  // the table's entrance animation ran with no rows to animate and logged "GSAP target .pit-row not found"
  test("a race without stops logs no warnings", async ({ page }) => {
    const warnings: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning") warnings.push(msg.text());
    });
    await page.goto("/races/193");
    await expect(page.locator("a.result-row")).toHaveCount(22);
    await page.getByRole("tab", { name: "Pit Stops" }).click();
    await expect(page.getByText("PitWall doesn't have this race's pit stop times.")).toBeVisible();
    // the rows would fade in over about 300 ms; give any warning from them time to arrive
    await page.waitForTimeout(800);
    expect(warnings).toEqual([]);
  });
});

import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

// A race page's Pit Stops tab with no stops says why. Before, every race without stops read "No pit stop telemetry
// ... only available for races from the 2022 season onwards", even a 2026 race (found live 2026-11-27: Brazil 2026's
// stops aren't in the database, so the API answers []) and a race that hasn't been run. From the saved fixtures:
// Brazil 2026 (race 193, run, no stops) and Qatar 2026 (race 195, not run yet).

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

test("a race that hasn't been run says its stops show after the race", async ({ page }) => {
  await page.goto("/races/195");
  await expect(page.getByRole("heading", { level: 1, name: "Qatar Grand Prix" })).toBeVisible();
  await page.getByRole("tab", { name: "Pit Stops" }).click();
  await expect(page.getByText("Pit stops show here after the race.")).toBeVisible();
  await expect(page.getByText(/2022 season/)).toHaveCount(0);
});

test("a race from before 2022 still says pit stop times start in 2022", async ({ page }) => {
  // the saved Brazil race, served as 2021's: a page route fills it from the file and wins over the host guard
  const file = path.join(test.info().project.testDir, "fixtures/api/races-193.json");
  const race = { ...JSON.parse(await readFile(file, "utf8")), season: 2021 };
  await page.route("**/api/v1/races/193", (route) => route.fulfill({ json: race }));
  await page.goto("/races/193");
  await expect(page.locator("a.result-row")).toHaveCount(22);
  await page.getByRole("tab", { name: "Pit Stops" }).click();
  await expect(page.getByText(/only available for races from the 2022 season onwards/)).toBeVisible();
});

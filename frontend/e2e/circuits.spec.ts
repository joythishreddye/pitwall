import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

// Circuit drawings and facts are matched on the API's circuit name (lib/constants/circuits.ts). Qatar's circuit
// comes back as "Lusail International Circuit", while its entry is keyed `losail` (Jolpica's circuit id).

// Nothing reaches the network beyond this machine (as in shell.spec.ts).
test.beforeEach(async ({ context, baseURL }) => {
  const host = new URL(baseURL ?? "http://127.0.0.1").hostname;
  await context.route(
    (url) => /^https?:$/.test(url.protocol) && url.hostname !== host,
    (route) => route.abort("blockedbyclient"),
  );
});

test("the Next Race tile draws Qatar's circuit", async ({ page }) => {
  // Wed 25 Nov: Qatar (round 22, Sun 29 Nov) is the next race
  await page.clock.setFixedTime(new Date("2026-11-25T18:00:00Z"));
  await page.goto("/");
  const tile = page
    .getByText("Next Race", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'overflow-hidden')][1]");
  await expect(tile).toContainText("Lusail International Circuit");
  // The outline sits in its own aria-hidden column, apart from the calendar icon (shown from a 320 px tile:
  // next-race-outline.spec.ts checks where)
  const outline = tile.getByTestId("next-race-outline");
  await expect(outline).toHaveAttribute("aria-hidden", "true");
  await expect(outline.locator("svg")).toHaveCount(1);
});

test.describe("a race's circuit facts", () => {
  test("a 2026 race shows no DRS zones: the 2026 cars have no DRS", async ({ page }) => {
    await page.goto("/races/195");
    await expect(page.getByText("Turns", { exact: true })).toBeVisible();
    await expect(page.getByText("DRS Zones", { exact: true })).toHaveCount(0);
  });

  test("a race from the DRS years (2011 to 2025) shows its DRS zones", async ({ page }) => {
    // The saved Qatar race, served as if it were 2024's. Filled from the file, never fetched: a page route
    // wins over the context's host guard above, so a fetch here could leave the machine
    const file = path.join(test.info().project.testDir, "fixtures/api/races-195.json");
    const saved = JSON.parse(await readFile(file, "utf8"));
    await page.route("**/api/v1/races/195", (route) => route.fulfill({ json: { ...saved, season: 2024 } }));
    await page.goto("/races/195");
    await expect(page.getByText("DRS Zones", { exact: true })).toBeVisible();
  });
});

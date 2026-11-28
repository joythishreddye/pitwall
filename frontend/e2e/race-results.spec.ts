import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

// The race results table at every width: 22 rows, each driver's name showing (in full from 390 px), the fastest lap
// showing, the winner's race time with its hours, and nothing wider than the screen. The three projects run 1440,
// 768 and 390; the small-phone block adds 360 and 375, where the driver's column is tightest.
// Brazil 2026 (race 193) from the saved fixture.

// Every call the page makes has a saved answer, so the browser logs no errors (a missing fixture is a 404 and an
// error), and nothing reaches the network beyond this machine (as in shell.spec.ts).
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

async function namesShow(page: Page) {
  await page.goto("/races/193");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const rows = page.locator("a.result-row");
  await expect(rows).toHaveCount(22);
  await expect(rows.first()).toContainText("Norris");

  // no sideways scroll on the page
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // every name's box has room to show at least a few letters (its own width, which clipping can shrink, not the
  // text's), and nothing in the row runs past its edge
  for (const row of await rows.all()) {
    const width = await row.locator(".result-name").evaluate((el) => el.clientWidth);
    expect(width).toBeGreaterThan(24);
    const spill = await row.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(spill).toBeLessThanOrEqual(0);
  }

  // the winner's race time keeps its hours (1 h 35 min, not "95:23.504"), and every Gap fits its column
  await expect(rows.first().locator(".result-gap")).toHaveText("1:35:23.504");
  expect(await cutShort(page.locator("a.result-row .result-gap"))).toEqual([]);
}

/** The texts whose box is narrower than the text itself (shown with an ellipsis or cut off), to the sub-pixel:
 * scrollWidth and clientWidth round to whole pixels, a Range over the text doesn't. */
function cutShort(boxes: Locator): Promise<string[]> {
  return boxes.evaluateAll((els) =>
    els
      .filter((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const text = range.getBoundingClientRect().width;
        return el.scrollWidth > el.clientWidth || text > el.getBoundingClientRect().width + 0.01;
      })
      .map((el) => el.textContent ?? ""),
  );
}

async function fastestLapShows(page: Page) {
  await page.goto("/races/193");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Antonelli set it, and his surname is long enough to be shortened on a phone
  const fl = page.getByLabel("Fastest lap").filter({ visible: true });
  await expect(fl).toHaveCount(1);
  const row = page.locator("a.result-row").filter({ has: fl });
  await expect(row).toContainText("Antonelli");
  const badge = (await fl.boundingBox())!;
  const phone = (page.viewportSize()?.width ?? 0) < 1024;
  // beside the name below 1024 px, so it must sit inside the driver's cell; in its own column from 1024 px
  const box = (await (phone ? row.locator(".result-driver") : row).boundingBox())!;
  expect(badge.width).toBeGreaterThan(8);
  expect(badge.x).toBeGreaterThanOrEqual(box.x);
  expect(badge.x + badge.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
  if (phone) {
    // on the team line under the surname, so the surname keeps the cell's whole width (both read in one pass: the
    // header above can re-wrap as the web fonts arrive, which moves the whole table)
    const below = await row.evaluate((el) => {
      const badge = el.querySelector('[aria-label="Fastest lap"]')!.getBoundingClientRect();
      const surname = el.querySelector(".result-name")!.getBoundingClientRect();
      return badge.top - surname.bottom;
    });
    expect(below).toBeGreaterThanOrEqual(-1);
  }
}

test("the results table fits the screen and shows every driver's name", async ({ page }) => {
  await namesShow(page);
});

test("every driver's name shows in full, with no ellipsis", async ({ page }) => {
  await page.goto("/races/193");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page.locator("a.result-row")).toHaveCount(22);
  expect(await cutShort(page.locator("a.result-row .result-name"))).toEqual([]);
});

test("a long status such as Disqualified fits the Gap column", async ({ page }) => {
  // The saved race with its last car (Bottas, who didn't start) disqualified instead. Filled from the file, never
  // fetched: a page route wins over the context's host guard above, so a fetch here could leave the machine
  const file = path.join(test.info().project.testDir, "fixtures/api/races-193.json");
  const saved = JSON.parse(await readFile(file, "utf8"));
  const results = saved.results.map((r: object, i: number) =>
    i === saved.results.length - 1 ? { ...r, status: "Disqualified", position_text: "D" } : r,
  );
  await page.route("**/api/v1/races/193", (route) => route.fulfill({ json: { ...saved, results } }));
  await page.goto("/races/193");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page.locator("a.result-row").last().locator(".result-gap")).toHaveText("Disqualified");
  expect(await cutShort(page.locator("a.result-row .result-gap"))).toEqual([]);
});

test("the fastest lap shows once, inside its row, even beside a long surname", async ({ page }) => {
  await fastestLapShows(page);
});

test("the team shows under the name below 1024 px and in its own column from 1024 px", async ({ page }) => {
  await page.goto("/races/193");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const first = page.locator("a.result-row").first();
  const team = first.getByText("McLaren", { exact: true });
  await expect(team).toHaveCount(2); // one for each layout, one of them hidden
  await expect(team.filter({ visible: true })).toHaveCount(1);
  const name = await first.locator("span.font-semibold.uppercase").boundingBox();
  const shown = await team.filter({ visible: true }).boundingBox();
  const phone = (page.viewportSize()?.width ?? 0) < 1024;
  // under the name below 1024 px; to its right in the full layout
  if (phone) {
    expect(shown!.y).toBeGreaterThan(name!.y);
  } else {
    expect(shown!.x).toBeGreaterThan(name!.x + name!.width);
  }
});

// Most Android phones are 360 px wide, the iPhone SE and mini 375
for (const width of [360, 375]) {
  test.describe(`on a ${width} px phone`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("every driver's name shows and nothing spills", async ({ page }) => {
      await namesShow(page);
    });

    test("the fastest lap still sits inside Antonelli's cell", async ({ page }) => {
      await fastestLapShows(page);
    });
  });
}

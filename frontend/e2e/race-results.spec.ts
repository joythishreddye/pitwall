import { expect, test, type Page } from "@playwright/test";

// The race results table at every width: 22 rows, each driver's name showing, the fastest lap showing, and nothing
// wider than the screen. The three projects run 1440, 768 and 390; the small-phone block adds 360 and 375, where
// the driver's column is tightest.
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
}

async function fastestLapShows(page: Page) {
  await page.goto("/races/193");
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
}

test("the results table fits the screen and shows every driver's name", async ({ page }) => {
  await namesShow(page);
});

test("the fastest lap shows once, inside its row, even beside a long surname", async ({ page }) => {
  await fastestLapShows(page);
});

test("the team shows under the name below 1024 px and in its own column from 1024 px", async ({ page }) => {
  await page.goto("/races/193");
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

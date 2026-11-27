import { expect, test, type Page } from "@playwright/test";

// The standings tables at every width: every row's name has room to show, nothing runs past its row or the
// screen, and the Pts heading sits over the points. The three projects run 1440, 768 and 390; the small-phone
// block adds 360 and 375. Before, at 390 the drivers' names shrank to one letter (found live on 2026-11-27).
// 2026 after round 21 from the saved fixture: 25 drivers, 11 constructors.

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

async function tableFits(page: Page, rowClass: string, count: number) {
  const rows = page.locator(rowClass);
  await expect(rows).toHaveCount(count);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  for (const row of await rows.all()) {
    // the name's own box (which clipping shrinks), not its text's
    const width = await row.locator(".standings-name").evaluate((el) => el.clientWidth);
    expect(width).toBeGreaterThan(60);
    const spill = await row.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(spill).toBeLessThanOrEqual(0);
  }

  // the Pts heading's right edge lines up with the first row's points
  const heading = (await page.locator(".standings-pts-heading").filter({ visible: true }).boundingBox())!;
  const points = (await rows.first().locator(".standings-pts").boundingBox())!;
  expect(Math.abs(heading.x + heading.width - (points.x + points.width))).toBeLessThanOrEqual(2);
}

async function bothTablesFit(page: Page) {
  await page.goto("/standings");
  await tableFits(page, "a.standings-row-driver", 25);
  await expect(page.locator("a.standings-row-driver").first()).toContainText("Antonelli");
  await page.getByRole("tab", { name: "constructors" }).click();
  await tableFits(page, ".standings-row-constructor", 11);
  await expect(page.locator(".standings-row-constructor").first()).toContainText("Mercedes");
}

test("both standings tables fit the screen and every name has room", async ({ page }) => {
  await bothTablesFit(page);
});

test("on phones the team shows under the driver's name; from 768 px in its own column", async ({ page }) => {
  await page.goto("/standings");
  const first = page.locator("a.standings-row-driver").first();
  const team = first.getByText("Mercedes", { exact: true });
  await expect(team).toHaveCount(2); // one for each layout, one of them hidden
  await expect(team.filter({ visible: true })).toHaveCount(1);
  // the name's box, not the text's: an inline span's box runs past its clipping
  const name = (await first.locator(".standings-name").boundingBox())!;
  const surname = (await first.getByText("Antonelli", { exact: true }).boundingBox())!;
  const shown = (await team.filter({ visible: true }).boundingBox())!;
  if ((page.viewportSize()?.width ?? 0) < 768) {
    expect(shown.y).toBeGreaterThan(surname.y);
  } else {
    expect(shown.x).toBeGreaterThanOrEqual(name.x + name.width);
  }
});

for (const width of [360, 375]) {
  test.describe(`on a ${width} px phone`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("both standings tables fit and every name has room", async ({ page }) => {
      await bothTablesFit(page);
    });
  });
}

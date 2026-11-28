import { expect, test, type Page } from "@playwright/test";

// The standings tables at every width: every row's name shows in full, nothing runs past its row or the
// screen, and the Pts heading sits over the points. The three projects run 1440, 768 and 390; the extra block
// adds 360, 375 and 1024. Before, at 390 the drivers' names shrank to one letter (found live on 2026-11-27), and
// at 768 long surnames still ended in "…" (VERSTAPPEN in a 74 px box: the team column and points bar took the room).
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
    // the name itself isn't cut short: neither the name box nor a line in it (the surname, the team under it).
    // scrollWidth is a whole number, so a text a fraction of a pixel too wide (which still shows "…") also
    // compares its own width with the box's
    const lines = row.locator(".standings-name, .standings-name .truncate").filter({ visible: true });
    for (const line of await lines.all()) {
      const cut = await line.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const past = range.getBoundingClientRect().width - el.getBoundingClientRect().width - 0.01;
        return Math.max(el.scrollWidth - el.clientWidth, past);
      });
      expect(cut, `"${await line.textContent()}" is cut short`).toBeLessThanOrEqual(0);
    }
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

test("below 1024 px the team shows under the driver's name; from 1024 px in its own column", async ({ page }) => {
  await page.goto("/standings");
  const first = page.locator("a.standings-row-driver").first();
  const team = first.getByText("Mercedes", { exact: true });
  await expect(team).toHaveCount(2); // one for each layout, one of them hidden
  await expect(team.filter({ visible: true })).toHaveCount(1);
  // the name's box, not the text's: an inline span's box runs past its clipping
  const name = (await first.locator(".standings-name").boundingBox())!;
  const surname = (await first.getByText("Antonelli", { exact: true }).boundingBox())!;
  const shown = (await team.filter({ visible: true }).boundingBox())!;
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    // on the line below the surname, inside the name's box (not a column of its own that sits a pixel lower)
    expect(shown.y).toBeGreaterThanOrEqual(surname.y + surname.height - 1);
    expect(shown.x).toBeLessThan(name.x + name.width);
  } else {
    expect(shown.x).toBeGreaterThanOrEqual(name.x + name.width);
  }
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  // the constructors chart has no dashed lines; animating them anyway logged "GSAP target .chart-line-dash not found"
  test("switching the chart between drivers and constructors logs no warnings", async ({ page }) => {
    const warnings: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning") warnings.push(msg.text());
    });
    await page.goto("/standings");
    await expect(page.locator("a.standings-row-driver")).toHaveCount(25);
    await page.getByRole("tab", { name: "constructors" }).click();
    await expect(page.locator(".standings-row-constructor")).toHaveCount(11);
    await page.getByRole("tab", { name: "drivers" }).click();
    await expect(page.locator("a.standings-row-driver")).toHaveCount(25);
    // the chart's lines draw in 300 ms; give any warning from them time to arrive
    await page.waitForTimeout(800);
    expect(warnings).toEqual([]);
  });
});

for (const width of [360, 375, 1024]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("both standings tables fit and every name has room", async ({ page }) => {
      await bothTablesFit(page);
    });
  });
}

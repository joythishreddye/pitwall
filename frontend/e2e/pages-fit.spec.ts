import { expect, test, type Page } from "@playwright/test";

// The pages no other test measures, at every width: nothing runs past the screen, so a phone never scrolls
// sideways. The three projects run 1440, 768 and 390; the block below adds 360 (most Android phones). The UI gate
// measures the homepage itself, and the standings, race and driver pages and the chat have their own specs.
// The races and drivers lists load the saved 2026 fixtures; Academy, Predictions, Live and the dashboard load no data.

const PAGES = ["/races", "/drivers", "/academy", "/predictions", "/live", "/dashboard"];

// Every call the page makes has a saved answer, so the browser logs no errors (a missing fixture is a 404 and an
// error), and nothing reaches the network beyond this machine (as in shell.spec.ts).
let errors: string[] = [];
test.beforeEach(async ({ context, baseURL, page }) => {
  errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`${page.url()}: ${msg.text()}`);
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

async function pagesFit(page: Page) {
  for (const url of PAGES) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    // polled, so an entrance animation that slides in from the side has time to finish; an overflow that stays fails
    await expect
      .poll(
        () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        { message: `${url} scrolls sideways` },
      )
      .toBeLessThanOrEqual(0);
  }
}

test("no page scrolls sideways", async ({ page }) => {
  await pagesFit(page);
});

test.describe("on a 360 px phone", () => {
  test.use({ viewport: { width: 360, height: 800 } });
  test("no page scrolls sideways", async ({ page }) => {
    await pagesFit(page);
  });
});

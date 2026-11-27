import { expect, test, type Page } from "@playwright/test";

// When one of the homepage's two requests fails and the other arrives, the page says what's missing and offers a
// retry, above the tiles that did load. Before, the missing tiles just weren't there, with no word why
// (seen live on 2026-11-27: the standings request was cut off on 1 of 3 loads). The fixed time puts Qatar 2026
// (Nov 29) next, as in countdown.spec.ts.

// Nothing reaches the network beyond this machine (as in shell.spec.ts).
test.beforeEach(async ({ context, baseURL, page }) => {
  const host = new URL(baseURL ?? "http://127.0.0.1").hostname;
  await context.route(
    (url) => /^https?:$/.test(url.protocol) && url.hostname !== host,
    (route) => route.abort("blockedbyclient"),
  );
  await page.clock.setFixedTime(new Date("2026-11-25T18:00:00Z"));
});

const STANDINGS = /\/api\/v1\/standings\/2026(\?.*)?$/;
const CALENDAR = /\/api\/v1\/seasons\/2026\/races(\?.*)?$/;

/** The one console error a cut-off request leaves, and nothing else. */
function onlyTheCutOff(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("net::ERR_FAILED")) errors.push(msg.text());
  });
  return errors;
}

test("standings cut off: the page says so, the race tiles still show, and a retry brings them back", async ({
  page,
}) => {
  const errors = onlyTheCutOff(page);
  await page.route(STANDINGS, (route) => route.abort("failed"));
  await page.goto("/");

  const notice = page.getByTestId("data-link-down");
  await expect(notice).toContainText("Data link lost");
  await expect(notice).toContainText("The standings aren't reaching the pit wall");
  // the calendar arrived, so the next race shows (revealed: the tiles start at opacity 0)
  await expect(page.getByRole("timer", { name: "Time to the race" })).toBeVisible();
  await expect(page.locator('[data-tile-id="next-race"]')).toHaveCSS("opacity", "1");
  await expect(page.locator('[data-tile-id="leader"]')).toHaveCount(0);
  await expect(page.locator('[data-tile-id="top5"]')).toHaveCount(0);

  // a retry that fails again keeps the same notice up (a remount would restart its auto-retries from zero)
  await notice.evaluate((el) => el.setAttribute("data-first", "yes"));
  const failedAgain = page.waitForEvent("requestfailed", (req) => STANDINGS.test(req.url()));
  await notice.getByRole("button", { name: "Retry now" }).click();
  await failedAgain;
  await expect(page.getByRole("button", { name: "Retry now" })).toBeEnabled();
  await expect(page.locator('[data-testid="data-link-down"][data-first="yes"]')).toHaveCount(1);
  await expect(page.getByText("Loading Race Data")).toHaveCount(0);

  await page.unroute(STANDINGS);
  await notice.getByRole("button", { name: "Retry now" }).click();
  await expect(page.getByTestId("data-link-down")).toHaveCount(0);
  await expect(page.locator('[data-tile-id="leader"]')).toContainText("ANTONELLI");
  await expect(page.locator('[data-tile-id="leader"]')).toHaveCSS("opacity", "1");
  expect(errors).toEqual([]);
});

test("calendar cut off: the page says so and the standings still show", async ({ page }) => {
  const errors = onlyTheCutOff(page);
  await page.route(CALENDAR, (route) => route.abort("failed"));
  await page.goto("/");

  const notice = page.getByTestId("data-link-down");
  await expect(notice).toContainText("The race calendar isn't reaching the pit wall");
  await expect(page.locator('[data-tile-id="leader"]')).toContainText("ANTONELLI");
  await expect(page.locator('[data-tile-id="leader"]')).toHaveCSS("opacity", "1");
  await expect(page.getByRole("timer", { name: "Time to the race" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("both cut off: one notice for the whole page", async ({ page }) => {
  const errors = onlyTheCutOff(page);
  await page.route(STANDINGS, (route) => route.abort("failed"));
  await page.route(CALENDAR, (route) => route.abort("failed"));
  await page.goto("/");

  await expect(page.getByTestId("data-link-down")).toHaveCount(1);
  await expect(page.getByTestId("data-link-down")).toContainText("Race data isn't reaching the pit wall");
  expect(errors).toEqual([]);
});

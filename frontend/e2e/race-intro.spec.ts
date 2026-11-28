import { expect, test, type Locator } from "@playwright/test";

// A race page opens on a full-screen drawing of its circuit, which folds away to show the page. With the reader's
// "reduce motion" setting on (this suite's default, playwright.config.ts) it must fold away at once. Before, it
// stayed over the race name and the top of the results for good, because the reduced-motion step ran while the
// page was still loading. Brazil 2026 (race 193) from the saved fixture.

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

/** Whether a click at the element's middle would reach it, rather than something drawn over it. */
function onTop(el: Locator): Promise<boolean> {
  return el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + Math.min(r.width / 2, 40), r.top + r.height / 2);
    return hit !== null && (hit === node || node.contains(hit));
  });
}

async function pageShows(page: import("@playwright/test").Page, timeout: number) {
  await page.goto("/races/193");
  const title = page.getByRole("heading", { level: 1, name: "Brazilian Grand Prix" });
  await expect(title).toBeVisible();
  await expect.poll(() => onTop(title), { timeout, message: "the circuit drawing still covers the race name" }).toBe(true);
  const circuit = page.getByText("Autódromo José Carlos Pace", { exact: true });
  await expect.poll(() => onTop(circuit), { timeout }).toBe(true);
  // the winner's row, once it's scrolled to
  const winner = page.locator("a.result-row").first();
  await winner.scrollIntoViewIfNeeded();
  await expect.poll(() => onTop(winner), { timeout }).toBe(true);
}

test("with reduced motion the circuit drawing gets out of the way at once", async ({ page }) => {
  await pageShows(page, 2_000);
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the circuit drawing folds away once it's drawn", async ({ page }) => {
    // 3.5 s to draw, then 0.5 s and 0.6 s to fold away
    await pageShows(page, 10_000);
  });
});

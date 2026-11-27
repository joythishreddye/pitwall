import { expect, test } from "@playwright/test";

// The race results table at every width: 22 rows, each driver's name showing, and nothing wider than the screen.
// Brazil 2026 (race 193) from the saved fixture.

// Nothing reaches the network beyond this machine (as in shell.spec.ts).
test.beforeEach(async ({ context, baseURL }) => {
  const host = new URL(baseURL ?? "http://127.0.0.1").hostname;
  await context.route(
    (url) => /^https?:$/.test(url.protocol) && url.hostname !== host,
    (route) => route.abort("blockedbyclient"),
  );
});

test("the results table fits the screen and shows every driver's name", async ({ page }) => {
  await page.goto("/races/193");
  const rows = page.locator("a.result-row");
  await expect(rows).toHaveCount(22);
  await expect(rows.first()).toContainText("Norris");

  // no sideways scroll on the page
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // every surname has room to show at least a few letters
  for (const row of await rows.all()) {
    const name = row.locator("span.font-semibold.uppercase");
    const box = await name.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(24);
  }
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

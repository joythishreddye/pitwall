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
  // The outline sits in its own aria-hidden layer, apart from the calendar icon
  await expect(tile.locator(':scope > div[aria-hidden="true"] svg')).toHaveCount(1);
});

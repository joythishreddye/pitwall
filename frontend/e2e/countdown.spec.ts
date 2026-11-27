import { expect, test } from "@playwright/test";

// The Next Race tile counts to the race's start: Jolpica's UTC start time, which the API sends without a
// zone ("16:00:00"). Qatar 2026 starts 2026-11-29T16:00Z (e2e/fixtures/api/seasons-2026-races.json).

// Nothing reaches the network beyond this machine (as in shell.spec.ts).
test.beforeEach(async ({ context, baseURL }) => {
  const host = new URL(baseURL ?? "http://127.0.0.1").hostname;
  await context.route(
    (url) => /^https?:$/.test(url.protocol) && url.hostname !== host,
    (route) => route.abort("blockedbyclient"),
  );
});

for (const timezoneId of ["America/Los_Angeles", "Asia/Tokyo"]) {
  test.describe(`the next race countdown in ${timezoneId}`, () => {
    test.use({ timezoneId });

    test("counts to the race's start, not to midnight of its day", async ({ page }) => {
      await page.clock.setFixedTime(new Date("2026-11-25T18:00:00Z"));
      await page.goto("/");
      const timer = page.getByRole("timer", { name: "Time to the race" });
      await expect(timer).toHaveText("03D:22H:00M:00S");
    });

    test("on race day before the start, it still counts to that race", async ({ page }) => {
      // Sun 29 Nov 01:00 in Tokyo and Sat 28 Nov 08:00 in Los Angeles
      await page.clock.setFixedTime(new Date("2026-11-28T16:00:00Z"));
      await page.goto("/");
      const timer = page.getByRole("timer", { name: "Time to the race" });
      await expect(timer).toHaveText("01D:00H:00M:00S");
      // And it isn't in Recent Results yet: that's for races already started (Las Vegas, id 194)
      await expect(page.locator('a[href="/races/194"]')).toBeVisible();
      await expect(page.locator('a[href="/races/195"]')).toHaveCount(0);
    });

    test("RACE DAY shows on the day the race starts in the reader's zone", async ({ page }) => {
      // Sun 29 Nov 07:30 in Los Angeles and Mon 30 Nov 00:30 in Tokyo: half an hour before the start in both
      await page.clock.setFixedTime(new Date("2026-11-29T15:30:00Z"));
      await page.goto("/");
      await expect(page.getByRole("timer", { name: "Time to the race" })).toHaveText("00D:00H:30M:00S");
      await expect(page.getByText("RACE DAY", { exact: true })).toBeVisible();
    });

    test("RACE DAY doesn't show the day before the race starts in the reader's zone", async ({ page }) => {
      // Sat 28 Nov 08:00 in Los Angeles and Sun 29 Nov 01:00 in Tokyo: Qatar's date, but the start is Monday there
      await page.clock.setFixedTime(new Date("2026-11-28T16:00:00Z"));
      await page.goto("/");
      await expect(page.getByRole("timer", { name: "Time to the race" })).toHaveText("01D:00H:00M:00S");
      await expect(page.getByText("RACE DAY", { exact: true })).toHaveCount(0);
    });

    test("the races page agrees: on race day before the start, that race is upcoming", async ({ page }) => {
      // Every call the page makes has a saved answer, so the browser logs no errors
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      await page.clock.setFixedTime(new Date("2026-11-28T16:00:00Z"));
      await page.goto("/races");
      const qatar = page.locator('a[href="/races/195"]');
      await expect(qatar).toContainText("UPCOMING");
      await expect(qatar).not.toContainText("COMPLETED");
      await expect(page.locator('a[href="/races/1388"]')).not.toContainText("UPCOMING");
      await expect(page.getByRole("combobox", { name: "Select season" })).toContainText("2026 (23 races)");
      expect(errors).toEqual([]);
    });

    test("the race's own page agrees: before the start, the race hasn't taken place yet", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      // Sun 29 Nov 12:00 UTC: past midnight UTC of Qatar's date, where the page used to stop calling it upcoming,
      // and 4 hours before the start
      await page.clock.setFixedTime(new Date("2026-11-29T12:00:00Z"));
      await page.goto("/races/195");
      await expect(page.getByText("This race hasn't taken place yet.", { exact: false })).toBeVisible();
      await expect(page.getByText("Results for this race are not yet available.")).toHaveCount(0);
      expect(errors).toEqual([]);
    });

    test("after the start and before results, the race's own page says results aren't in yet", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      // Sun 29 Nov 17:00 UTC: an hour after lights out, with no results stored yet
      await page.clock.setFixedTime(new Date("2026-11-29T17:00:00Z"));
      await page.goto("/races/195");
      await expect(page.getByText("Results for this race are not yet available.")).toBeVisible();
      await expect(page.getByText("This race hasn't taken place yet.", { exact: false })).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });
}

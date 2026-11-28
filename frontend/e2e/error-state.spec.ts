import { expect, test } from "@playwright/test";

// The message a page shows when its data doesn't load is readable: small red text is f1-red-text (#FF5C5C, 6.33:1
// on the page's background), never the brand red #DC0000 (3.69:1), per DESIGN.md. Before, the shared error message
// on Standings, Races and Drivers used the brand red at 14 px.

let errors: string[] = [];
// the browser logs a failed request as a console error; these tests fail requests on purpose
const FAILED_REQUEST = /^Failed to load resource/;
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
  expect(errors.filter((e) => !FAILED_REQUEST.test(e))).toEqual([]);
});

const PAGES = [
  { path: "/standings", message: "Failed to load standings data" },
  { path: "/races", message: "Failed to load race calendar" },
  { path: "/drivers", message: "Failed to load drivers" },
];

for (const { path, message } of PAGES) {
  test(`${path}'s load error is readable red text with a Retry`, async ({ page }) => {
    await page.route("**/api/v1/**", (route) => route.fulfill({ status: 503, json: { detail: "busy" } }));
    await page.goto(path);
    const text = page.getByText(message, { exact: true });
    await expect(text).toBeVisible();
    await expect(text).toHaveCSS("color", "rgb(255, 92, 92)");
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });
}

import { expect, test, type Page } from "@playwright/test";

// The chat keeps the tab's finished messages in sessionStorage (lib/hooks/use-chat.ts), so a reload or a
// visit to another page and back shows them again. Nothing here sends a question.
const SESSION_KEY = "pitwall_chat_history";
const STORED = [
  { id: "u1", role: "user", content: "A question asked earlier in this tab", timestamp: 1 },
  { id: "a1", role: "assistant", content: "The answer given earlier in this tab", timestamp: 2 },
];

test.beforeEach(async ({ context, baseURL }) => {
  const host = new URL(baseURL ?? "http://127.0.0.1").hostname;
  await context.route(
    (url) => /^https?:$/.test(url.protocol) && url.hostname !== host,
    (route) => route.abort("blockedbyclient"),
  );
});

// Each message renders twice, a desktop and a phone layout, and CSS hides one of them at each width.
function shown(page: Page, text: string) {
  return page.getByText(text).filter({ visible: true });
}

// The sidebar (768 and up) or the phone tab bar, whichever this width shows. Exact names leave out the
// breadcrumb's "HOME" and the logo's "PitWall home".
function navLink(page: Page, name: string) {
  return page.getByRole("link", { name, exact: true }).filter({ visible: true });
}

/** Collects console errors (a hydration mismatch among them), page errors and chat requests. */
function watch(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  const chatRequests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/v1/chat")) chatRequests.push(req.url());
  });
  return { errors, chatRequests };
}

// Seed the tab's storage before the page's own scripts run, once: a reload keeps what the page saved.
async function seedOnce(page: Page) {
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, value);
    },
    [SESSION_KEY, JSON.stringify(STORED)] as const,
  );
}

async function expectStoredShownAndSaved(page: Page) {
  for (const message of STORED) await expect(shown(page, message.content)).toBeVisible();
  const saved = await page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY);
  expect(JSON.parse(saved ?? "[]")).toHaveLength(STORED.length);
}

test.describe("the chat", () => {
  test("shows the tab's earlier messages after a reload, with no console error", async ({ page }) => {
    const seen = watch(page);
    await seedOnce(page);

    await page.goto("/chat");
    for (const message of STORED) await expect(shown(page, message.content)).toBeVisible();

    await page.reload();
    await expectStoredShownAndSaved(page);

    expect(seen.errors, "console errors, a hydration mismatch among them").toEqual([]);
    expect(seen.chatRequests).toEqual([]);
  });

  test("shows them again after a visit to another page and back, without a reload", async ({ page }) => {
    const seen = watch(page);
    await seedOnce(page);

    await page.goto("/chat");
    for (const message of STORED) await expect(shown(page, message.content)).toBeVisible();
    // A mark on the window survives a client-side page change but not a reload.
    await page.evaluate(() => Object.assign(window, { pitwallSameDocument: true }));

    await navLink(page, "Home").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(STORED[0].content)).toHaveCount(0);

    await navLink(page, "Chat").click();
    await expect(page).toHaveURL(/\/chat$/);
    await expectStoredShownAndSaved(page);
    expect(await page.evaluate(() => "pitwallSameDocument" in window), "the page reloaded").toBe(true);

    expect(seen.errors, "console errors").toEqual([]);
    expect(seen.chatRequests).toEqual([]);
  });

  test("offers presets about 2026's rules, not DRS or the fastest lap point", async ({ page }) => {
    const seen = watch(page);

    await page.goto("/chat");
    for (const name of ["OVERTAKE MODE", "2026 RULES"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    }
    // 2026 cars have no DRS, and the fastest lap point went in 2025
    for (const name of ["DRS RULES", "FASTEST LAP"]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    }

    expect(seen.errors, "console errors").toEqual([]);
    expect(seen.chatRequests).toEqual([]);
  });
});

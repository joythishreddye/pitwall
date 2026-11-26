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

test.describe("the chat", () => {
  test("shows the tab's earlier messages after a reload, with no console error", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));
    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    // Seed the tab's storage before the page's own scripts run, once: a reload keeps what the page saved.
    await page.addInitScript(
      ([key, value]) => {
        if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, value);
      },
      [SESSION_KEY, JSON.stringify(STORED)] as const,
    );

    await page.goto("/chat");
    for (const message of STORED) await expect(shown(page, message.content)).toBeVisible();

    await page.reload();
    for (const message of STORED) await expect(shown(page, message.content)).toBeVisible();
    const saved = await page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY);
    expect(JSON.parse(saved ?? "[]")).toHaveLength(STORED.length);

    expect(errors, "console errors, a hydration mismatch among them").toEqual([]);
    expect(requests.filter((u) => u.includes("/api/v1/chat"))).toEqual([]);
  });
});

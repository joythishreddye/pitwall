import { expect, test, type Page } from "@playwright/test";

// The site's shell: the desktop sidebar, its phone tab bar and the top bar (DESIGN.md).
const SHELL = 'aside, nav[aria-label="Mobile navigation"], header';
// A fixed clock, so anything the page computes from today's date is the same on every run.
const NOW = new Date("2026-11-25T18:00:00Z");

// Nothing reaches the network beyond this machine, not even once: a request to any other host is aborted
// before it's sent, and the first test below then fails on it.
test.beforeEach(async ({ context, baseURL }) => {
  const host = new URL(baseURL ?? "http://127.0.0.1").hostname;
  await context.route(
    (url) => /^https?:$/.test(url.protocol) && url.hostname !== host,
    (route) => route.abort("blockedbyclient"),
  );
});

async function openHome(page: Page) {
  await page.clock.setFixedTime(NOW);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

test.describe("the shell", () => {
  test("no request leaves the machine, and none goes to the chat", async ({ page, baseURL }) => {
    const urls: string[] = [];
    page.on("request", (req) => urls.push(req.url()));
    await openHome(page);
    const origin = new URL(baseURL ?? "http://127.0.0.1").hostname;
    const outside = urls.filter((u) => !u.startsWith("data:") && new URL(u).hostname !== origin);
    expect(outside, "requests that left 127.0.0.1").toEqual([]);
    expect(urls.filter((u) => u.includes("/api/v1/chat"))).toEqual([]);
  });

  test("the sidebar shows at 768 and up, the phone tab bar below", async ({ page }) => {
    await openHome(page);
    const sidebar = page.locator("aside");
    const tabBar = page.getByRole("navigation", { name: "Mobile navigation" });
    if ((page.viewportSize()?.width ?? 0) >= 768) {
      await expect(sidebar).toBeVisible();
      await expect(tabBar).toBeHidden();
    } else {
      await expect(sidebar).toBeHidden();
      await expect(tabBar).toBeVisible();
    }
  });

  test("no text in the shell is under 11 px", async ({ page }) => {
    await openHome(page);
    const small = await page.evaluate((selector) => {
      const out: string[] = [];
      for (const root of document.querySelectorAll(selector)) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement;
          if (!el || !n.nodeValue?.trim() || el.getClientRects().length === 0) continue;
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (size < 11) out.push(`${size}px "${n.nodeValue.trim()}"`);
        }
      }
      return out;
    }, SHELL);
    expect(small, "shell text under 11 px").toEqual([]);
  });

  test("the shell shows no LIVE label or pulsing live dot outside a session", async ({ page }) => {
    await openHome(page);
    const live = await page.evaluate((selector) => {
      const out: string[] = [];
      for (const root of document.querySelectorAll<HTMLElement>(selector)) {
        for (const el of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
          if (el.getClientRects().length === 0) continue;
          // Nothing in the shell animates outside a session, so any CSS animation counts (a pulse, a ping).
          // globals.css's reduced-motion rule shortens animations but keeps their names.
          for (const pseudo of [null, "::before", "::after"]) {
            const name = getComputedStyle(el, pseudo).animationName;
            if (name !== "none") out.push(`${name} on ${el.tagName.toLowerCase()}${pseudo ?? ""}`);
          }
          // The nav link to the Live page says "Live" as a page name, not as a live indicator.
          if (el.closest('a[href="/live"]')) continue;
          const own = [...el.childNodes]
            .filter((c) => c.nodeType === Node.TEXT_NODE)
            .map((c) => c.nodeValue ?? "")
            .join(" ");
          if (/\blive\b/i.test(own)) out.push(`text "${own.trim()}"`);
        }
      }
      return out;
    }, SHELL);
    expect(live, "live indicators in the shell").toEqual([]);
  });

  // Baselines of the shell at each width (an approval point: see DESIGN.md, Checks). The page content isn't
  // in them, so the homepage can change without touching these.
  test("the shell matches its approved screenshots", async ({ page }) => {
    await openHome(page);
    await expect(page.locator("header")).toHaveScreenshot("topbar.png");
    if ((page.viewportSize()?.width ?? 0) >= 768) {
      await expect(page.locator("aside")).toHaveScreenshot("sidebar.png");
    } else {
      await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toHaveScreenshot("tab-bar.png");
    }
  });
});

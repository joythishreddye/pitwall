import { expect, test, type Page } from "@playwright/test";

// The race page's header at every width: the circuit, date and round line wraps without leaving a "|" at the start
// or end of a line (at 390 px it read "| 2026-11-08 |"), and no text on the page is under DESIGN.md's 11 px (the
// circuit facts labels were 10 px). The three projects run 1440, 768 and 390; 360 is added for the narrowest
// phones. Brazil 2026 (race 193) from the saved fixture.

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

type Piece = { text: string; left: number; right: number; mid: number };

/** The info line under the title, split into the pieces a reader sees: each line fragment of its texts, and each
 * "|" separator that isn't clipped away. */
async function infoLine(page: Page): Promise<{ texts: Piece[]; separators: Piece[] }> {
  const line = page.getByRole("heading", { level: 1 }).locator("xpath=following-sibling::div[1]");
  await expect(line).toContainText("Autódromo José Carlos Pace");
  return line.evaluate((wrap) => {
    const clip = wrap.getBoundingClientRect();
    const texts: Piece[] = [];
    const separators: Piece[] = [];
    const walker = document.createTreeWalker(wrap, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? "";
      if (!text) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (r.width === 0) continue;
        const piece = { text, left: r.left, right: r.right, mid: r.top + r.height / 2 };
        if (text === "|") {
          // shown only if some of it is inside the line's box (an overflow-hidden box clips the rest)
          if (r.right > clip.left + 0.5 && r.left < clip.right - 0.5) separators.push(piece);
        } else {
          texts.push(piece);
        }
      }
    }
    return { texts, separators };
  });
}

async function checkInfoLine(page: Page) {
  await page.goto("/races/193");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const { texts, separators } = await infoLine(page);
  const all = texts.map((t) => t.text).join(" ");
  for (const part of ["Autódromo José Carlos Pace", "2026-11-08", "Round 20"]) expect(all).toContain(part);
  // every "|" a reader sees has a text before it and after it on its own line
  for (const sep of separators) {
    const sameLine = texts.filter((t) => Math.abs(t.mid - sep.mid) < 4);
    expect(sameLine.some((t) => t.right <= sep.left + 0.5), `a "|" starts a line at x=${sep.left}`).toBe(true);
    expect(sameLine.some((t) => t.left >= sep.right - 0.5), `a "|" ends a line at x=${sep.left}`).toBe(true);
  }
  return separators.length;
}

test("the circuit, date and round line never starts or ends a line with a separator", async ({ page }) => {
  const shown = await checkInfoLine(page);
  // with room for it all on one line, both separators show
  if ((page.viewportSize()?.width ?? 0) >= 1024) expect(shown).toBe(2);
});

test.describe("on a 360 px phone", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("the circuit, date and round line never starts or ends a line with a separator", async ({ page }) => {
    await checkInfoLine(page);
  });
});

test("no text on the race page is under 11 px", async ({ page }) => {
  await page.goto("/races/193");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page.locator("a.result-row")).toHaveCount(22);
  const small = await page.locator("main").evaluate((main) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const el = node.parentElement;
      if (!text || !el || !el.checkVisibility()) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 11) out.push(`"${text}" at ${size}px`);
    }
    return out;
  });
  expect(small).toEqual([]);
});

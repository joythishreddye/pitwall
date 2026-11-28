import { expect, test, type Locator } from "@playwright/test";

// The Next Race tile's track drawing stays clear of the tile's text at every width. Before, at 768 and 390 the
// drawing ran behind the circuit name and the countdown digits (flagged by four screenshot judgments on
// 2026-11-27). The three projects run 1440, 768 and 390. Two fixed times give two track shapes: Qatar 2026 (Nov 29,
// Lusail) next, as in countdown.spec.ts, and then Abu Dhabi (Dec 6, Yas Marina).

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

type Box = { x: number; y: number; width: number; height: number };

function overlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function clip(a: Box, to: Box): Box {
  const x = Math.max(a.x, to.x);
  const y = Math.max(a.y, to.y);
  const right = Math.min(a.x + a.width, to.x + to.width);
  const bottom = Math.min(a.y + a.height, to.y + to.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

/** The box of the text itself: a block's own box spans the whole tile, its text doesn't. */
function textBox(el: Locator): Promise<Box> {
  return el.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

/** Where the track's lines are painted: the union of its paths' boxes. */
function paintedBox(drawing: Locator): Promise<Box> {
  return drawing.evaluate((node) => {
    const boxes = [...node.querySelectorAll("path")].map((p) => p.getBoundingClientRect());
    const x = Math.min(...boxes.map((b) => b.left));
    const y = Math.min(...boxes.map((b) => b.top));
    const right = Math.max(...boxes.map((b) => b.right));
    const bottom = Math.max(...boxes.map((b) => b.bottom));
    return { x, y, width: right - x, height: bottom - y };
  });
}

/** The width a container query inside the tile compares with: its @container element's content box. */
function containerWidth(tile: Locator): Promise<number> {
  return tile.evaluate((node) => {
    const box = node.querySelector('[class~="@container"]');
    if (!box) throw new Error("the Next Race tile has no @container element");
    const s = getComputedStyle(box);
    const edges = ["borderLeftWidth", "borderRightWidth", "paddingLeft", "paddingRight"] as const;
    return box.getBoundingClientRect().width - edges.reduce((sum, k) => sum + parseFloat(s[k]), 0);
  });
}

const RACES = [
  { when: "2026-11-25T18:00:00Z", name: "Qatar Grand Prix", circuit: /Lusail International Circuit/, date: "2026-11-29" },
  { when: "2026-12-01T12:00:00Z", name: "Abu Dhabi Grand Prix", circuit: /Yas Marina Circuit/, date: "2026-12-06" },
];

for (const race of RACES) {
  test(`the track drawing stays clear of the Next Race tile's text (${race.name})`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(race.when));
    await page.goto("/");
    const tile = page.locator('[data-tile-id="next-race"]');
    await expect(tile).toHaveCSS("opacity", "1");
    await expect(tile.getByText(race.name)).toBeVisible();

    const tileBox = (await tile.boundingBox())!;
    const drawing = tile.getByTestId("next-race-outline");
    // the track shows from a 320 px tile (390 and 1440 here); the 768 screen's tile is narrower, so it has none. The
    // layout rule measures the tile's content box (inside its border), so that's the width to compare.
    const roomy = (await containerWidth(tile)) >= 320;
    await expect(drawing).toBeVisible({ visible: roomy });
    if (!roomy) return;

    const texts: Record<string, Box> = {
      label: await textBox(tile.getByText("Next Race", { exact: true })),
      round: await textBox(tile.getByText(/^Round \d+$/)),
      name: await textBox(tile.getByText(race.name)),
      circuit: await textBox(tile.getByText(race.circuit)),
      countdown: await textBox(tile.getByRole("timer", { name: "Time to the race" })),
      date: await textBox(tile.getByText(race.date)),
    };

    // the track's column sits beside the text, so a circuit of any shape stays clear of it
    const column = clip((await drawing.boundingBox())!, tileBox);
    for (const [what, box] of Object.entries(texts)) {
      expect(overlap(column, box), `the track's column covers the ${what}`).toBe(false);
    }

    // and the lines themselves, which may run past the column's bottom, stay clear where the tile shows them
    const painted = clip(await paintedBox(drawing), tileBox);
    expect(painted.width).toBeGreaterThan(40);
    for (const [what, box] of Object.entries(texts)) {
      expect(overlap(painted, box), `the track's lines cross the ${what}`).toBe(false);
    }
  });
}

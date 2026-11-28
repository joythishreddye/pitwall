import { expect, test } from "@playwright/test";

// Each section names its browser tab, and a page inside a section inherits that title. The served HTML
// carries the title, so no page is rendered and nothing calls the API.
const TITLES: [string, string][] = [
  ["/", "PitWall — AI Race Engineer"],
  ["/standings", "Standings · PitWall"],
  ["/races", "Races · PitWall"],
  ["/races/193", "Races · PitWall"],
  ["/drivers", "Drivers · PitWall"],
  ["/chat", "Chat · PitWall"],
  ["/predictions", "Predictions · PitWall"],
  ["/live", "Live · PitWall"],
  ["/academy", "Academy · PitWall"],
  ["/dashboard", "Live Dashboard · PitWall"],
];

test("each section names its browser tab", async ({ request }) => {
  for (const [path, title] of TITLES) {
    const response = await request.get(path);
    expect(response.ok(), `${path} answered ${response.status()}`).toBe(true);
    const html = await response.text();
    expect(html.match(/<title>([^<]*)<\/title>/)?.[1], path).toBe(title);
  }
});

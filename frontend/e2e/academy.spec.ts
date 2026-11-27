import { expect, test } from "@playwright/test";

// The pillar is "Academy", never "F1 Academy" (F1 ACADEMY is a trademark; CLAUDE.md).

test("the Academy page's heading says Academy, and the page never says F1 Academy", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("/academy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Academy");
  await expect(page.getByText(/F1\s+Academy/i)).toHaveCount(0);
  expect(errors).toEqual([]);
});

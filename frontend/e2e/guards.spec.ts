import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { openF1Base } from "../lib/hooks/use-driver-photos";
import { missingFixtureUrls, refusalMessage } from "./fixture-build.mjs";

// Two guards checked in Node, with no page, so no browser opens. They run once per width project, which is
// harmless: they don't depend on the viewport.

const API = "NEXT_PUBLIC_API_URL isn't http://127.0.0.1:8100";
const OPENF1 = "NEXT_PUBLIC_OPENF1_URL isn't http://127.0.0.1:8100/openf1";

test.describe("the OpenF1 base URL", () => {
  test("an unset, empty or spaces-only value falls back to OpenF1", () => {
    for (const value of [undefined, "", "   "]) {
      expect(openF1Base(value), JSON.stringify(value)).toBe("https://api.openf1.org");
    }
  });

  test("a padded value is trimmed", () => {
    expect(openF1Base("  http://x  ")).toBe("http://x");
  });
});

// A chunks folder with one `.js` file per entry, laid out like `.next/static/chunks` (files in subfolders too).
async function chunksFolder(name: string, files: Record<string, string>) {
  const dir = test.info().outputPath(name);
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), text);
  }
  return dir;
}

async function missingNames(dir: string) {
  return (await missingFixtureUrls(dir)).map(({ name }) => name);
}

test.describe("serve.mjs refuses a build without both fixture URLs", () => {
  test("a normal build reports both, and the refusal names both", async () => {
    const dir = await chunksFolder("normal", {
      "app/page-1a2b.js": 'let t="http://localhost:8000";',
      "4c5d.js": 'const o="https://api.openf1.org".trim()||"https://api.openf1.org";',
    });
    expect(await missingNames(dir)).toEqual(["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_OPENF1_URL"]);
    const message = refusalMessage(await missingFixtureUrls(dir));
    expect(message).toContain(API);
    expect(message).toContain(OPENF1);
  });

  test("chunks with only the API URL report the OpenF1 one", async () => {
    const dir = await chunksFolder("api-only", { "app/page-1a2b.js": 'let t="http://127.0.0.1:8100";' });
    expect(await missingNames(dir)).toEqual(["NEXT_PUBLIC_OPENF1_URL"]);
    const message = refusalMessage(await missingFixtureUrls(dir));
    expect(message).toContain(OPENF1);
    expect(message).not.toContain("NEXT_PUBLIC_API_URL");
  });

  test("chunks with only the OpenF1 URL report the API one", async () => {
    const dir = await chunksFolder("openf1-only", {
      "4c5d.js": 'const o="http://127.0.0.1:8100/openf1".trim()||"https://api.openf1.org";',
    });
    expect(await missingNames(dir)).toEqual(["NEXT_PUBLIC_API_URL"]);
    const message = refusalMessage(await missingFixtureUrls(dir));
    expect(message).toContain(API);
    expect(message).not.toContain("NEXT_PUBLIC_OPENF1_URL");
  });

  test("a build with both URLs, in different chunks, reports none", async () => {
    const dir = await chunksFolder("both", {
      "app/page-1a2b.js": 'let t="http://127.0.0.1:8100";',
      "4c5d.js": 'const o="http://127.0.0.1:8100/openf1".trim()||"https://api.openf1.org";',
    });
    expect(await missingNames(dir)).toEqual([]);
  });

  test("a missing chunks folder reports both", async () => {
    expect(await missingNames(test.info().outputPath("no-build"))).toEqual([
      "NEXT_PUBLIC_API_URL",
      "NEXT_PUBLIC_OPENF1_URL",
    ]);
  });
});

// What `build:e2e` bakes into the client chunks, and the check serve.mjs runs before it serves a build.
// No top-level side effects, so e2e/guards.spec.ts can import it.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const FIXTURE_API_PORT = 8100;
export const FIXTURE_API_URL = `http://127.0.0.1:${FIXTURE_API_PORT}`;

// The two URLs `build:e2e` bakes in, each checked on its own: a build with only one of them would still send
// the other upstream to production. OpenF1's URL starts with the API's, so the API check skips that match.
export const BAKED_URLS = [
  { name: "NEXT_PUBLIC_API_URL", url: FIXTURE_API_URL, pattern: /http:\/\/127\.0\.0\.1:8100(?!\/openf1)/ },
  { name: "NEXT_PUBLIC_OPENF1_URL", url: `${FIXTURE_API_URL}/openf1`, pattern: /http:\/\/127\.0\.0\.1:8100\/openf1/ },
];

/**
 * The baked URLs missing from the `.js` files under `chunksDir` (a build's `.next/static/chunks`). A missing
 * folder reports both. `next build` replaces .next's chunks, so a real folder holds only the current build's.
 * @param {string} chunksDir
 */
export async function missingFixtureUrls(chunksDir) {
  let names;
  try {
    names = await readdir(chunksDir, { recursive: true });
  } catch {
    return [...BAKED_URLS];
  }
  const missing = new Set(BAKED_URLS);
  for (const name of names) {
    if (!name.endsWith(".js")) continue;
    const text = await readFile(path.join(chunksDir, name), "utf8");
    for (const baked of missing) if (baked.pattern.test(text)) missing.delete(baked);
    if (missing.size === 0) break;
  }
  return [...missing];
}

/**
 * The text serve.mjs prints when it refuses a build: each missing variable and the URL it should hold.
 * @param {{ name: string, url: string }[]} missing
 */
export function refusalMessage(missing) {
  const names = missing.map(({ name, url }) => `${name} isn't ${url}`).join("; ");
  return (
    `serve: .next wasn't built by \`build:e2e\` (${names}). ` +
    "Run `pnpm build:e2e` first, so the pages talk to the fixture API and not to production."
  );
}

// Serves the e2e build: the fixture API plus `next start`, both on 127.0.0.1, in one process group.
// The UI gate runs this as verify.json's `start` (with PORT set) and kills the group when it's done;
// Playwright's webServer runs it when the suite is started by hand.
// It refuses a build that wasn't made by `build:e2e`, because that build would call the production API.
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { startFixtureApi } from "./fixture-api.mjs";

export const FIXTURE_API_PORT = 8100;
const FIXTURE_API_URL = `http://127.0.0.1:${FIXTURE_API_PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT || "3100";

async function builtForFixtures() {
  const dir = path.join(ROOT, ".next", "static", "chunks");
  let names;
  try {
    names = await readdir(dir, { recursive: true });
  } catch {
    return false;
  }
  for (const name of names) {
    if (!name.endsWith(".js")) continue;
    if ((await readFile(path.join(dir, name), "utf8")).includes(FIXTURE_API_URL)) return true;
  }
  return false;
}

if (!(await builtForFixtures())) {
  console.error(
    `serve: .next wasn't built by \`build:e2e\` (no chunk calls ${FIXTURE_API_URL}). ` +
      "Run `pnpm build:e2e` first, so the pages talk to the fixture API and not to production.",
  );
  process.exit(1);
}

await startFixtureApi({ port: FIXTURE_API_PORT });
console.log(`serve: fixture API on ${FIXTURE_API_URL}`);

const next = spawn(path.join(ROOT, "node_modules", ".bin", "next"), ["start", "-H", "127.0.0.1", "-p", port], {
  cwd: ROOT,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    next.kill(signal);
    process.exit(0);
  });
}
next.on("exit", (code) => process.exit(code ?? 1));

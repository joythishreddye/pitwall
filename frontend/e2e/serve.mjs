// Serves the e2e build: the fixture API plus `next start`, both on 127.0.0.1, in one process group.
// The UI gate runs this as verify.json's `start` (with PORT set) and kills the group when it's done;
// Playwright's webServer runs it when the suite is started by hand.
// It refuses a build that wasn't made by `build:e2e`, because that build would call the production API.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { startFixtureApi } from "./fixture-api.mjs";
import { FIXTURE_API_PORT, FIXTURE_API_URL, missingFixtureUrls, refusalMessage } from "./fixture-build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT || "3100";

const missing = await missingFixtureUrls(path.join(ROOT, ".next", "static", "chunks"));
if (missing.length > 0) {
  console.error(refusalMessage(missing));
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

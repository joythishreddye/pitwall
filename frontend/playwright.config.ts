import { defineConfig } from "@playwright/test";

// The e2e suite for the UI gate (verify-outcome). It runs against the build from `pnpm build:e2e`, served by
// `e2e/serve.mjs` with the fixture API, so no test reaches the production API, the chat or OpenF1.
// The gate starts that server itself and passes VERIFY_BASE_URL. By hand, webServer starts it, and never reuses
// a server already on the port: that one could be a normal build that calls the production API.
const PORT = 3100;
const baseURL = process.env.VERIFY_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  retries: 0,
  expect: {
    toHaveScreenshot: {
      // From the tokens: the closest pair, f1-dark-3 #252525 and f1-grid #2B2B2B, is 6 luma levels apart.
      // pixelmatch flags a pure-luma shift above about 264 x threshold levels, so 0.01 catches shifts above
      // ~2.6 levels (2.3x margin on that pair). Playwright's default 0.2 lets shifts up to ~53 levels through.
      threshold: 0.01,
    },
  },
  use: {
    baseURL,
    video: "on",
    // GSAP entrances check prefers-reduced-motion, so screenshots catch the settled page.
    reducedMotion: "reduce",
  },
  projects: [
    { name: "w1440", use: { viewport: { width: 1440, height: 900 } } },
    { name: "w768", use: { viewport: { width: 768, height: 900 } } },
    { name: "w390", use: { viewport: { width: 390, height: 900 } } },
  ],
  ...(process.env.VERIFY_BASE_URL
    ? {}
    : {
        webServer: {
          command: "npm run start:e2e",
          url: baseURL,
          reuseExistingServer: false,
          env: { PORT: String(PORT) },
          timeout: 60_000,
        },
      }),
});

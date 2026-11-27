import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for plain functions under lib/ (the e2e specs in e2e/ run on Playwright, not here).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});

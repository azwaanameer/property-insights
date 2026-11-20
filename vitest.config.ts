import { defineConfig } from "vitest/config";

// Separate from vite.config.ts on purpose: tests must not load the Cloudflare or TanStack Start plugins.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "pipeline/**/*.test.mjs", "db/**/*.test.mjs"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});

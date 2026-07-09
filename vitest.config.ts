import { defineConfig } from "vitest/config";

// Vitest owns unit/integration tests under `tests/`.
// Playwright smoke specs live under `e2e/` and are excluded here so the two
// runners never pick up each other's files.
// The `@/*` alias mirrors tsconfig.json paths (Vitest does not read tsconfig
// paths on its own).
export default defineConfig({
  resolve: {
    alias: {
      "@": import.meta.dirname,
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});

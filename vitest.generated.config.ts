import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@traceforge/schema": resolve(__dirname, "packages/schema/src/index.ts"),
      "@traceforge/core": resolve(__dirname, "packages/core/src/index.ts"),
      "@traceforge/adapter-terminal": resolve(__dirname, "packages/adapter-terminal/src/index.ts"),
      "@traceforge/adapter-mcp": resolve(__dirname, "packages/adapter-mcp/src/index.ts"),
      "@traceforge/fixtures": resolve(__dirname, "packages/fixtures/src/index.ts"),
      "@traceforge/adapter-browser": resolve(__dirname, "packages/adapter-browser/src/index.ts")
    }
  },
  test: {
    include: [
      ".traceforge/**/*.test.ts"
    ],
    environment: "node"
  }
});

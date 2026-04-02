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
      "packages/**/src/**/*.test.ts",
      "packages/**/src/**/*.test.tsx",
      "apps/**/src/**/*.test.ts",
      "apps/**/src/**/*.test.tsx"
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      ".traceforge/**"
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      all: true,
      include: [
        "packages/**/src/**/*.ts",
        "apps/**/src/**/*.{ts,tsx}"
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/node_modules/**",
        "**/dist/**"
      ]
    },
    environment: "node"
  }
});

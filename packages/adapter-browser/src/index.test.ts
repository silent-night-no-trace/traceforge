import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readEvents, readManifest } from "@traceforge/core";
import { captureBrowserRun } from "./index";

describe("adapter-browser", () => {
  it("captures a browser page into a bundle when a browser is available", async (context) => {
    const outputDir = await mkdtemp(join(tmpdir(), "traceforge-browser-capture-"));

    try {
      const result = await captureBrowserRun({
        url: "data:text/html,<title>Traceforge Browser Test</title><h1>Hello</h1><script>console.log('browser test')</script>",
        outputDir,
        waitMs: 50,
        headless: true
      });

      const manifest = await readManifest(result.bundleDir);
      const events = await readEvents(result.bundleDir);

      expect(result.status).toBe("passed");
      expect(manifest.metadata.source).toBe("browser");
      expect(manifest.artifactCount).toBeGreaterThan(0);
      expect(events.some((event) => event.type === "browser.action")).toBe(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Executable doesn't exist") || message.includes("browserType.launch")) {
        context.skip();
        return;
      }

      throw error;
    }
  });
});

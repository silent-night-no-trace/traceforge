import { describe, expect, it } from "vitest";
import { createTraceCapabilities, type TraceManifest } from "@traceforge/schema";
import { buildViewPayload } from "./viewPayload";

function manifestFor(source: "terminal" | "mcp" | "browser"): TraceManifest {
  const now = new Date().toISOString();

  return {
    schemaVersion: "0.1.0",
    runId: `run_${source}`,
    createdAt: now,
    updatedAt: now,
    status: "passed",
    metadata: {
      title: source,
      args: [],
      source,
      startedAt: now,
      environment: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        cwd: process.cwd(),
        ci: false
      },
      tools: [],
      tags: []
    },
    capabilities: createTraceCapabilities(source),
    eventCount: 0,
    artifactCount: 0,
    artifacts: [],
    redactionRules: []
  };
}

describe("buildViewPayload", () => {
  it("returns source-agnostic capability payloads for terminal, mcp, and browser bundles", () => {
    const terminal = buildViewPayload({
      bundleDir: "terminal-bundle",
      traceApi: "http://127.0.0.1:1",
      viewerMode: "built-dist",
      viewerUrl: "http://127.0.0.1/view-terminal",
      opened: false,
      manifest: manifestFor("terminal")
    });

    const mcp = buildViewPayload({
      bundleDir: "mcp-bundle",
      traceApi: "http://127.0.0.1:2",
      viewerMode: "built-dist",
      viewerUrl: "http://127.0.0.1/view-mcp",
      opened: false,
      manifest: manifestFor("mcp")
    });

    const browser = buildViewPayload({
      bundleDir: "browser-bundle",
      traceApi: "http://127.0.0.1:3",
      viewerMode: "built-dist",
      viewerUrl: "http://127.0.0.1/view-browser",
      opened: false,
      manifest: manifestFor("browser")
    });

    expect(terminal.capabilities.replay.status).toBe("supported");
    expect(mcp.capabilities.replay.status).toBe("unsupported");
    expect(browser.capabilities.exportTest.status).toBe("partial");
    expect(browser.capabilities.view.status).toBe("supported");
  });
});

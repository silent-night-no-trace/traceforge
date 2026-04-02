import { describe, expect, it } from "vitest";
import {
  createEventId,
  createRunId,
  createTraceCapabilities,
  isTraceEvent,
  parseReplayReport,
  parseTraceEvent,
  parseTraceManifest,
  resolveTraceCapabilities
} from "./index";

function legacyManifest(source: "terminal" | "mcp" | "browser") {
  const now = new Date().toISOString();

  return {
    schemaVersion: "0.1.0",
    runId: "run_legacy",
    createdAt: now,
    updatedAt: now,
    status: "passed",
    metadata: {
      source,
      startedAt: now,
      environment: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        cwd: process.cwd(),
        ci: false
      }
    },
    capabilities: {
      source,
      supportsReplay: source === "terminal",
      supportsExportTest: true,
      supportsView: true
    },
    eventCount: 0,
    artifactCount: 0,
    artifacts: []
  };
}

describe("schema helpers", () => {
  it("creates prefixed event and run ids", () => {
    expect(createEventId("evt")).toMatch(/^evt_[a-z0-9]{8}$/);
    expect(createRunId("run")).toMatch(/^run_[a-z0-9]{8}$/);
  });

  it("normalizes legacy capability booleans when parsing manifests", () => {
    const manifest = parseTraceManifest(legacyManifest("browser"));

    expect(manifest.capabilities?.source).toBe("browser");
    expect(manifest.capabilities?.replay.status).toBe("unsupported");
    expect(manifest.capabilities?.exportTest.status).toBe("supported");
    expect(manifest.redactionRules).toEqual([]);
  });

  it("returns source defaults unless explicit capabilities are provided", () => {
    const fallback = resolveTraceCapabilities("mcp");
    const explicit = resolveTraceCapabilities("terminal", createTraceCapabilities("browser"));

    expect(fallback.replay.status).toBe("unsupported");
    expect(fallback.replay.reason).toContain("MCP trace bundles");
    expect(explicit.source).toBe("browser");
    expect(explicit.exportTest.status).toBe("partial");
  });

  it("validates and parses trace events", () => {
    const event = parseTraceEvent({
      type: "tool.output",
      eventId: "evt_output",
      runId: "run_123",
      ts: new Date().toISOString(),
      source: "mcp",
      stepId: "step_echo",
      toolName: "echo",
      output: { echoed: true }
    });

    expect(isTraceEvent(event)).toBe(true);
    expect(event.type).toBe("tool.output");
    if (event.type !== "tool.output") {
      throw new Error("Expected a tool.output event");
    }

    expect(event.isError).toBe(false);
    expect(event.artifactRefs).toEqual([]);
    expect(isTraceEvent({ type: "not-real" })).toBe(false);
  });

  it("parses replay reports with optional assertions and capabilities", () => {
    const report = parseReplayReport({
      runId: "run_123",
      replayedAt: new Date().toISOString(),
      status: "failed",
      assertions: [
        {
          checkpointId: "checkpoint_stdout_text",
          passed: false,
          artifactRefs: ["artifact_stdout"]
        }
      ],
      capabilities: createTraceCapabilities("terminal")
    });

    expect(report.assertions).toHaveLength(1);
    expect(report.capabilities?.replay.status).toBe("supported");
  });
});

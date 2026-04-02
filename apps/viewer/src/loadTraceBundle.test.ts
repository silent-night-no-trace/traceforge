import { afterEach, describe, expect, it, vi } from "vitest";
import { createTraceCapabilities } from "@traceforge/schema";
import { loadTraceBundleFiles, loadTraceBundleFromApi } from "./loadTraceBundle";

function createManifest() {
  const now = "2026-01-01T00:00:00.000Z";

  return {
    schemaVersion: "0.1.0",
    runId: "run_viewer",
    createdAt: now,
    updatedAt: now,
    status: "passed",
    metadata: {
      title: "Viewer trace",
      args: [],
      source: "terminal",
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
    capabilities: createTraceCapabilities("terminal"),
    eventCount: 2,
    artifactCount: 1,
    artifacts: [
      {
        id: "artifact_stdout",
        kind: "stdout",
        path: "artifacts/stdout.txt",
        sha256: "abc123"
      }
    ],
    redactionRules: []
  };
}

function createEventsText() {
  return [
    JSON.stringify({
      type: "step.completed",
      eventId: "evt_2",
      runId: "run_viewer",
      ts: "2026-01-01T00:00:02.000Z",
      source: "terminal",
      stepId: "step_1",
      status: "passed"
    }),
    JSON.stringify({
      type: "step.started",
      eventId: "evt_1",
      runId: "run_viewer",
      ts: "2026-01-01T00:00:01.000Z",
      source: "terminal",
      stepId: "step_1",
      title: "First step"
    })
  ].join("\n");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadTraceBundle", () => {
  it("loads local manifest and events files, then sorts events by timestamp", async () => {
    const manifestFile = new File([JSON.stringify(createManifest())], "manifest.json", {
      type: "application/json"
    });
    const eventsFile = new File([createEventsText()], "events.ndjson", {
      type: "application/x-ndjson"
    });

    const bundle = await loadTraceBundleFiles(manifestFile, eventsFile);

    expect(bundle.events.map((event) => event.eventId)).toEqual(["evt_1", "evt_2"]);
    expect(bundle.artifactById.artifact_stdout?.path).toBe("artifacts/stdout.txt");
    expect(bundle.replayReport).toBeUndefined();
  });

  it("loads bundle data from the trace API and exposes artifact URLs", async () => {
    const manifest = createManifest();
    const replayReport = {
      runId: manifest.runId,
      replayedAt: "2026-01-01T00:00:03.000Z",
      status: "passed",
      assertions: [],
      capabilities: manifest.capabilities
    };
    const fetchMock = vi.fn(async (input: string) => {
      if (input.endsWith("/api/manifest")) {
        return new Response(JSON.stringify(manifest), { status: 200 });
      }

      if (input.endsWith("/api/events")) {
        return new Response(createEventsText(), { status: 200 });
      }

      if (input.endsWith("/api/replay-report")) {
        return new Response(JSON.stringify(replayReport), { status: 200 });
      }

      if (input.endsWith("/health")) {
        return new Response(JSON.stringify({ bundleDir: "C:/traceforge/run_viewer" }), { status: 200 });
      }

      return new Response(null, { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const bundle = await loadTraceBundleFromApi("http://127.0.0.1:9999/");

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(bundle.bundleDir).toBe("C:/traceforge/run_viewer");
    expect(bundle.replayReport?.status).toBe("passed");
    expect(bundle.artifactUrlForId?.("artifact_stdout")).toBe(
      "http://127.0.0.1:9999/api/artifacts/artifact_stdout"
    );
  });
});

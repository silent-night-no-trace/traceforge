import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBundleWriter, readEvents, readManifest } from "./bundle";

describe("core bundle writer", () => {
  it("writes manifest and events", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "traceforge-core-"));
    const writer = await createBundleWriter(rootDir);

    await writer.writeManifest({
      schemaVersion: "0.1.0",
      runId: "run_123",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "running",
      metadata: {
        source: "terminal",
        startedAt: new Date().toISOString(),
        environment: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          cwd: process.cwd(),
          ci: false
        },
        args: [],
        tools: [],
        tags: []
      },
      eventCount: 1,
      artifactCount: 0,
      artifacts: [],
      redactionRules: []
    });

    await writer.appendEvent({
      type: "run.started",
      eventId: "evt_123",
      runId: "run_123",
      ts: new Date().toISOString(),
      source: "terminal",
      metadata: {
        source: "terminal",
        startedAt: new Date().toISOString(),
        environment: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          cwd: process.cwd(),
          ci: false
        },
        args: [],
        tools: [],
        tags: []
      }
    });

    const manifest = await readManifest(rootDir);
    const events = await readEvents(rootDir);

    expect(manifest.runId).toBe("run_123");
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("run.started");
  });
});

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startTraceViewServer, validateBundleDir } from "./viewServer";

type CreatedBundle = {
  bundleDir: string;
  manifestText: string;
  eventsText: string;
};

async function createBundleFixture(options?: {
  replayReport?: boolean;
  artifactPath?: string;
}): Promise<CreatedBundle> {
  const bundleDir = await mkdtemp(join(tmpdir(), "traceforge-view-server-"));
  const artifactsDir = join(bundleDir, "artifacts");
  await mkdir(artifactsDir, { recursive: true });

  const manifest = {
    schemaVersion: "0.1.0",
    runId: "run_view",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "passed",
    metadata: {
      title: "View server fixture",
      args: [],
      source: "terminal",
      startedAt: "2026-01-01T00:00:00.000Z",
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
    eventCount: 1,
    artifactCount: 1,
    artifacts: [
      {
        id: "artifact_stdout",
        kind: "stdout",
        path: options?.artifactPath ?? "artifacts/stdout.txt",
        sha256: "abc123",
        mimeType: "text/plain; charset=utf-8",
        size: 11,
        description: "stdout artifact"
      }
    ],
    redactionRules: []
  };
  const manifestText = JSON.stringify(manifest, null, 2);
  const eventsText = `${JSON.stringify({
    type: "run.started",
    eventId: "evt_run_started",
    runId: "run_view",
    ts: "2026-01-01T00:00:00.000Z",
    source: "terminal",
    metadata: manifest.metadata
  })}\n`;

  await writeFile(join(bundleDir, "manifest.json"), manifestText, "utf8");
  await writeFile(join(bundleDir, "events.ndjson"), eventsText, "utf8");
  await writeFile(join(artifactsDir, "stdout.txt"), "hello trace", "utf8");

  if (options?.replayReport) {
    await writeFile(
      join(bundleDir, "replay-report.json"),
      JSON.stringify({
        runId: "run_view",
        replayedAt: "2026-01-01T00:00:02.000Z",
        status: "passed",
        assertions: []
      }),
      "utf8"
    );
  }

  return { bundleDir, manifestText, eventsText };
}

const serversToClose: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (serversToClose.length > 0) {
    const close = serversToClose.pop();
    if (close) {
      await close();
    }
  }
});

describe("viewServer", () => {
  it("validates required bundle files", async () => {
    const fixture = await createBundleFixture();

    await expect(validateBundleDir(fixture.bundleDir)).resolves.toBeUndefined();
    await expect(validateBundleDir(join(fixture.bundleDir, "missing"))).rejects.toThrow();
  });

  it("serves manifest, events, health, replay report, and artifacts over HTTP", async () => {
    const fixture = await createBundleFixture({ replayReport: true });
    const server = await startTraceViewServer(fixture.bundleDir);
    serversToClose.push(server.close);

    const [health, manifest, events, replayReport, artifact] = await Promise.all([
      fetch(`${server.baseUrl}/health`),
      fetch(`${server.baseUrl}/api/manifest`),
      fetch(`${server.baseUrl}/api/events`),
      fetch(`${server.baseUrl}/api/replay-report`),
      fetch(`${server.baseUrl}/api/artifacts/artifact_stdout`)
    ]);

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ ok: true, bundleDir: fixture.bundleDir });

    expect(manifest.status).toBe(200);
    await expect(manifest.text()).resolves.toBe(fixture.manifestText);

    expect(events.status).toBe(200);
    await expect(events.text()).resolves.toBe(fixture.eventsText);

    expect(replayReport.status).toBe(200);
    await expect(replayReport.json()).resolves.toMatchObject({ status: "passed" });

    expect(artifact.status).toBe(200);
    expect(artifact.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(artifact.headers.get("content-disposition")).toContain("stdout.txt");
    await expect(artifact.text()).resolves.toBe("hello trace");
  });

  it("returns 404/405/204 for missing resources, invalid methods, and CORS preflight", async () => {
    const fixture = await createBundleFixture();
    const server = await startTraceViewServer(fixture.bundleDir);
    serversToClose.push(server.close);

    const [missingReplay, missingArtifact, unknown, postResponse, optionsResponse] = await Promise.all([
      fetch(`${server.baseUrl}/api/replay-report`),
      fetch(`${server.baseUrl}/api/artifacts/does-not-exist`),
      fetch(`${server.baseUrl}/unknown`),
      fetch(`${server.baseUrl}/health`, { method: "POST" }),
      fetch(`${server.baseUrl}/health`, { method: "OPTIONS" })
    ]);

    expect(missingReplay.status).toBe(404);
    expect(missingArtifact.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(postResponse.status).toBe(405);
    expect(optionsResponse.status).toBe(204);
    expect(optionsResponse.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("rejects artifact paths that escape the bundle root", async () => {
    const fixture = await createBundleFixture({ artifactPath: "../outside.txt" });
    const server = await startTraceViewServer(fixture.bundleDir);
    serversToClose.push(server.close);

    const response = await fetch(`${server.baseUrl}/api/artifacts/artifact_stdout`);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("escapes bundle")
    });
  });
});

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { captureTerminalRun } from "@traceforge/adapter-terminal";
import { createBundleWriter, readManifest } from "./bundle";
import { replayBundle, replayTerminalBundle } from "./replay";

describe("replayTerminalBundle", () => {
  it("writes a passing replay report for a matching terminal run", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "traceforge-replay-pass-"));

    const capture = await captureTerminalRun({
      command: process.execPath,
      args: ["-e", "process.stdout.write('ok\\n'); process.stderr.write('warn\\n'); process.exit(0)"],
      outputDir
    });

    const replay = await replayTerminalBundle({
      bundleDir: capture.bundleDir
    });

    expect(replay.report.status).toBe("passed");
    expect(replay.report.assertions.every((assertion) => assertion.passed)).toBe(true);

    const saved = JSON.parse(await readFile(replay.reportPath, "utf8")) as { status: string };
    expect(saved.status).toBe("passed");
  });

  it("includes first-difference details when stdout diverges", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "traceforge-replay-stdout-diff-"));

    const capture = await captureTerminalRun({
      command: process.execPath,
      args: ["-e", "process.stdout.write('original\\n'); process.exit(0)"],
      outputDir
    });

    const manifest = await readManifest(capture.bundleDir);

    await writeFile(
      join(capture.bundleDir, "manifest.json"),
      `${JSON.stringify(
        {
          ...manifest,
          metadata: {
            ...manifest.metadata,
            command: process.execPath,
            args: ["-e", "process.stdout.write('changed\\n'); process.exit(0)"]
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const replay = await replayTerminalBundle({
      bundleDir: capture.bundleDir
    });

    const stdoutAssertion = replay.report.assertions.find(
      (assertion) => assertion.checkpointId === "checkpoint_stdout_text"
    );

    expect(replay.report.status).toBe("failed");
    expect(stdoutAssertion?.passed).toBe(false);
    expect(stdoutAssertion?.message).toContain("line 1, column 1");
    expect(stdoutAssertion?.stepId).toBeTruthy();

    expect(stdoutAssertion?.expected).toMatchObject({
      firstDifferenceIndex: 0,
      line: 1,
      column: 1
    });

    expect(stdoutAssertion?.actual).toMatchObject({
      firstDifferenceIndex: 0,
      line: 1,
      column: 1
    });
  });

  it("writes an explicit unsupported replay report for MCP bundles", async () => {
    const bundleDir = await mkdtemp(join(tmpdir(), "traceforge-replay-mcp-"));
    const writer = await createBundleWriter(bundleDir);
    const now = new Date().toISOString();

    await writer.writeManifest({
      schemaVersion: "0.1.0",
      runId: "run_mcp_replay",
      createdAt: now,
      updatedAt: now,
      status: "passed",
      metadata: {
        title: "mcp replay unsupported",
        command: process.execPath,
        args: [],
        source: "mcp",
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
      eventCount: 1,
      artifactCount: 0,
      artifacts: [],
      redactionRules: []
    });

    await writer.appendEvent({
      type: "step.started",
      eventId: "evt_mcp_step",
      runId: "run_mcp_replay",
      ts: now,
      source: "mcp",
      stepId: "step_mcp_echo",
      title: "call echo"
    });

    const replay = await replayBundle({
      bundleDir
    });

    expect(replay.report.status).toBe("failed");
    expect(replay.report.assertions[0]?.checkpointId).toBe("replay_not_supported");
    expect(replay.report.assertions[0]?.message).toContain("not yet supported");
  });
});

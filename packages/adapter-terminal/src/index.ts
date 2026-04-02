import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  createTraceCapabilities,
  TRACEFORGE_SCHEMA_VERSION,
  createEventId,
  createRunId,
  nowIso,
  type ArtifactRef,
  type TraceEvent,
  type TraceManifest
} from "@traceforge/schema";
import { createBundleWriter, writeArtifact } from "@traceforge/core";

export const TERMINAL_MAIN_STEP_ID = "step_terminal_main";

export type CaptureTerminalOptions = {
  command: string;
  args: string[];
  outputDir: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export type CaptureTerminalResult = {
  runId: string;
  bundleDir: string;
  exitCode: number;
  status: "passed" | "failed";
};

export async function captureTerminalRun(
  options: CaptureTerminalOptions
): Promise<CaptureTerminalResult> {
  const runId = createRunId();
  const startedAt = nowIso();
  const bundleDir = join(options.outputDir, runId);

  await mkdir(bundleDir, { recursive: true });

  const writer = await createBundleWriter(bundleDir);

  let eventCount = 0;
  let stdoutText = "";
  let stderrText = "";
  let writeQueue: Promise<void> = Promise.resolve();

  const manifest: TraceManifest = {
    schemaVersion: TRACEFORGE_SCHEMA_VERSION,
    runId,
    createdAt: startedAt,
    updatedAt: startedAt,
    status: "running",
    metadata: {
      title: options.command,
      command: options.command,
      args: options.args,
      source: "terminal",
      startedAt,
      environment: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        shell: process.env.SHELL ?? process.env.ComSpec,
        cwd: options.cwd ?? process.cwd(),
        ci: Boolean(process.env.CI)
      },
      tools: [],
      tags: []
    },
    capabilities: createTraceCapabilities("terminal"),
    eventCount: 0,
    artifactCount: 0,
    artifacts: [],
    redactionRules: []
  };

  async function pushEvent(event: TraceEvent): Promise<void> {
    await writer.appendEvent(event);
    eventCount += 1;
  }

  function enqueueEvent(event: TraceEvent): void {
    writeQueue = writeQueue.then(() => pushEvent(event));
  }

  await pushEvent({
    type: "run.started",
    eventId: createEventId(),
    runId,
    ts: startedAt,
    source: "terminal",
    metadata: manifest.metadata
  });

  await pushEvent({
    type: "step.started",
    eventId: createEventId(),
    runId,
    ts: startedAt,
    source: "terminal",
    stepId: TERMINAL_MAIN_STEP_ID,
    title: [options.command, ...options.args].join(" ").trim()
  });

  await writer.writeManifest({ ...manifest, eventCount });

  const child = spawn(options.command, options.args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    shell: false
  });

  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    stdoutText += text;

    enqueueEvent({
      type: "output.chunk",
      eventId: createEventId(),
      runId,
      ts: nowIso(),
      source: "terminal",
      stepId: TERMINAL_MAIN_STEP_ID,
      stream: "stdout",
      text
    });
  });

  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    stderrText += text;

    enqueueEvent({
      type: "output.chunk",
      eventId: createEventId(),
      runId,
      ts: nowIso(),
      source: "terminal",
      stepId: TERMINAL_MAIN_STEP_ID,
      stream: "stderr",
      text
    });
  });

  const exitCode = await new Promise<number>((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("close", (code) => resolvePromise(code ?? 1));
  });

  await writeQueue;

  const artifacts: ArtifactRef[] = [];

  if (stdoutText) {
    artifacts.push(
      await writeArtifact(bundleDir, {
        fileName: "stdout.txt",
        kind: "stdout",
        content: stdoutText,
        mimeType: "text/plain; charset=utf-8",
        description: "Captured terminal stdout"
      })
    );
  }

  if (stderrText) {
    artifacts.push(
      await writeArtifact(bundleDir, {
        fileName: "stderr.txt",
        kind: "stderr",
        content: stderrText,
        mimeType: "text/plain; charset=utf-8",
        description: "Captured terminal stderr"
      })
    );
  }

  const artifactRefs = artifacts.map((artifact) => artifact.id);

  const finishedAt = nowIso();
  const status: "passed" | "failed" = exitCode === 0 ? "passed" : "failed";

  if (status === "failed") {
    await pushEvent({
      type: "step.failed",
      eventId: createEventId(),
      runId,
      ts: finishedAt,
      source: "terminal",
      stepId: TERMINAL_MAIN_STEP_ID,
      error: {
        kind: "runtime",
        message: `Process exited with code ${exitCode}`,
        code: String(exitCode)
      },
      artifactRefs
    });
  }

  await pushEvent({
    type: "checkpoint.recorded",
    eventId: createEventId(),
    runId,
    ts: finishedAt,
    source: "terminal",
    stepId: TERMINAL_MAIN_STEP_ID,
    checkpoint: {
      id: "checkpoint_exit_code",
      kind: "exit-code",
      label: "Process exit code",
      expected: 0,
      actual: exitCode,
      passed: exitCode === 0,
      artifactRefs
    }
  });

  await pushEvent({
    type: "step.completed",
    eventId: createEventId(),
    runId,
    ts: finishedAt,
    source: "terminal",
    stepId: TERMINAL_MAIN_STEP_ID,
    status
  });

  await pushEvent({
    type: "run.completed",
    eventId: createEventId(),
    runId,
    ts: finishedAt,
    source: "terminal",
    status,
    exitCode
  });

  await writer.writeManifest({
    ...manifest,
    updatedAt: finishedAt,
    status,
    eventCount,
    artifactCount: artifacts.length,
    artifacts
  });

  return {
    runId,
    bundleDir,
    exitCode,
    status
  };
}

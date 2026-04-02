import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  resolveTraceCapabilities,
  nowIso,
  type ArtifactRef,
  type ReplayAssertion,
  type ReplayReport,
  type TraceEvent,
  type TraceManifest
} from "@traceforge/schema";
import { readEvents, readManifest, writeArtifact, writeManifest } from "./bundle";

export type ReplayTerminalBundleOptions = {
  bundleDir: string;
  cwd?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  timeoutMs?: number | undefined;
};

export type ReplayBundleOptions = ReplayTerminalBundleOptions;

export type ReplayTerminalBundleResult = {
  report: ReplayReport;
  reportPath: string;
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type ReplayBundleResult = ReplayTerminalBundleResult;

type ExpectedExitCode = {
  expectedExitCode: number;
  stepId?: string | undefined;
};

type ExpectedTextArtifact = {
  text: string;
  artifactId?: string;
};

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").trimEnd();
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function previewText(text: string, maxChars = 200): string {
  return text.slice(0, maxChars);
}

function lineAndColumnAt(text: string, index: number): { line: number; column: number } {
  let line = 1;
  let column = 1;

  for (let i = 0; i < Math.min(index, text.length); i += 1) {
    if (text[i] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  return { line, column };
}

function contextWindow(text: string, index: number, radius = 40): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";

  return `${prefix}${text.slice(start, end)}${suffix}`;
}

type TextDiffSummary = {
  equal: boolean;
  firstDifferenceIndex: number | null;
  line: number | null;
  column: number | null;
  expectedContext: string | null;
  actualContext: string | null;
};

function diffText(expected: string, actual: string): TextDiffSummary {
  const normalizedExpected = normalizeText(expected);
  const normalizedActual = normalizeText(actual);

  const minLength = Math.min(normalizedExpected.length, normalizedActual.length);

  let index = 0;
  while (index < minLength && normalizedExpected[index] === normalizedActual[index]) {
    index += 1;
  }

  const equal =
    index === normalizedExpected.length &&
    index === normalizedActual.length;

  if (equal) {
    return {
      equal: true,
      firstDifferenceIndex: null,
      line: null,
      column: null,
      expectedContext: null,
      actualContext: null
    };
  }

  const { line, column } = lineAndColumnAt(normalizedExpected, index);

  return {
    equal: false,
    firstDifferenceIndex: index,
    line,
    column,
    expectedContext: contextWindow(normalizedExpected, index),
    actualContext: contextWindow(normalizedActual, index)
  };
}

function summarizeTextForAssertion(
  text: string,
  diff: TextDiffSummary,
  side: "expected" | "actual"
): Record<string, unknown> {
  const normalized = normalizeText(text);

  return {
    normalizedLength: normalized.length,
    sha256: sha256(normalized),
    preview: previewText(normalized),
    firstDifferenceIndex: diff.firstDifferenceIndex,
    line: diff.line,
    column: diff.column,
    contextAtDifference: side === "expected" ? diff.expectedContext : diff.actualContext
  };
}

function isReplayGeneratedArtifact(artifact: ArtifactRef): boolean {
  return artifact.path.endsWith("replay-stdout.txt") || artifact.path.endsWith("replay-stderr.txt");
}

async function readArtifactText(bundleDir: string, artifact: ArtifactRef): Promise<string> {
  return readFile(join(bundleDir, artifact.path), "utf8");
}

async function findExpectedOutput(
  bundleDir: string,
  manifest: TraceManifest,
  kind: "stdout" | "stderr"
): Promise<ExpectedTextArtifact> {
  const artifact = manifest.artifacts.find(
    (candidate) => candidate.kind === kind && !isReplayGeneratedArtifact(candidate)
  );

  if (!artifact) {
    return { text: "" };
  }

  return {
    text: await readArtifactText(bundleDir, artifact),
    artifactId: artifact.id
  };
}

function findExpectedExitCode(events: TraceEvent[]): ExpectedExitCode {
  for (const event of events) {
    if (event.type === "checkpoint.recorded" && event.checkpoint.kind === "exit-code") {
      const expected =
        typeof event.checkpoint.expected === "number"
          ? event.checkpoint.expected
          : typeof event.checkpoint.actual === "number"
            ? event.checkpoint.actual
            : undefined;

      if (expected !== undefined) {
        return {
          expectedExitCode: expected,
          stepId: event.stepId
        };
      }
    }
  }

  for (const event of events) {
    if (event.type === "run.completed" && typeof event.exitCode === "number") {
      return {
        expectedExitCode: event.exitCode
      };
    }
  }

  throw new Error("No recorded exit-code checkpoint found in trace bundle.");
}

function firstStepId(events: TraceEvent[]): string | undefined {
  const stepStart = events.find((event) => event.type === "step.started");
  return stepStart?.stepId;
}

async function writeReplayReport(
  bundleDir: string,
  report: ReplayReport
): Promise<string> {
  const reportPath = join(bundleDir, "replay-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function writeUnsupportedReplayReport(input: {
  bundleDir: string;
  manifest: TraceManifest;
  events: TraceEvent[];
  message: string;
}): Promise<ReplayBundleResult> {
  const stepId = firstStepId(input.events);
  const report: ReplayReport = {
    runId: input.manifest.runId,
    replayedAt: nowIso(),
    status: "failed",
    divergenceStepId: stepId,
    capabilities: resolveTraceCapabilities(
      input.manifest.metadata.source,
      input.manifest.capabilities
    ),
    assertions: [
      {
        checkpointId: "replay_not_supported",
        stepId,
        passed: false,
        message: input.message,
        expected: {
          source: input.manifest.metadata.source,
          supported: ["terminal"]
        },
        actual: {
          source: input.manifest.metadata.source,
          supported: false
        },
        artifactRefs: []
      }
    ]
  };

  const reportPath = await writeReplayReport(input.bundleDir, report);

  return {
    report,
    reportPath,
    stdout: "",
    stderr: "",
    exitCode: 1
  };
}

async function runCommand(options: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      shell: false
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        timedOut
      });
    });
  });
}

function buildExitCodeAssertion(input: {
  stepId?: string | undefined;
  expectedExitCode: number;
  actualExitCode: number;
  artifactRefs: string[];
}): ReplayAssertion {
  const passed = input.expectedExitCode === input.actualExitCode;

  return {
    checkpointId: "checkpoint_exit_code",
    stepId: input.stepId,
    passed,
    message: passed
      ? `Exit code matched (${input.actualExitCode}).`
      : `Expected exit code ${input.expectedExitCode}, got ${input.actualExitCode}.`,
    expected: input.expectedExitCode,
    actual: input.actualExitCode,
    artifactRefs: input.artifactRefs
  };
}

function buildTextAssertion(input: {
  checkpointId: string;
  stepId?: string | undefined;
  label: string;
  expected: string;
  actual: string;
  artifactRefs: string[];
}): ReplayAssertion {
  const diff = diffText(input.expected, input.actual);
  const passed = diff.equal;

  return {
    checkpointId: input.checkpointId,
    stepId: input.stepId,
    passed,
    message: passed
      ? `${input.label} matched.`
      : `${input.label} differed at line ${diff.line}, column ${diff.column} (index ${diff.firstDifferenceIndex}).`,
    expected: summarizeTextForAssertion(input.expected, diff, "expected"),
    actual: summarizeTextForAssertion(input.actual, diff, "actual"),
    artifactRefs: input.artifactRefs
  };
}

function buildTimeoutAssertion(
  timedOut: boolean,
  timeoutMs: number,
  stepId?: string | undefined
): ReplayAssertion | null {
  if (!timedOut) {
    return null;
  }

  return {
    checkpointId: "checkpoint_timeout",
    stepId,
    passed: false,
    message: `Replay command timed out after ${timeoutMs}ms.`,
    expected: { timedOut: false },
    actual: { timedOut: true },
    artifactRefs: []
  };
}

function assertTerminalReplayable(manifest: TraceManifest): void {
  if (manifest.metadata.source !== "terminal") {
    throw new Error(
      `Replay skeleton currently supports only terminal bundles, received '${manifest.metadata.source}'.`
    );
  }

  if (!manifest.metadata.command) {
    throw new Error("Trace bundle is missing the original command.");
  }
}

function mergeReplayArtifacts(
  manifest: TraceManifest,
  replayArtifacts: ArtifactRef[]
): TraceManifest {
  const retained = manifest.artifacts.filter((artifact) => !isReplayGeneratedArtifact(artifact));

  return {
    ...manifest,
    updatedAt: nowIso(),
    artifactCount: retained.length + replayArtifacts.length,
    artifacts: [...retained, ...replayArtifacts]
  };
}

export async function replayTerminalBundle(
  options: ReplayTerminalBundleOptions
): Promise<ReplayTerminalBundleResult> {
  const manifest = await readManifest(options.bundleDir);
  const events = await readEvents(options.bundleDir);

  assertTerminalReplayable(manifest);

  const { expectedExitCode, stepId } = findExpectedExitCode(events);
  const [expectedStdout, expectedStderr] = await Promise.all([
    findExpectedOutput(options.bundleDir, manifest, "stdout"),
    findExpectedOutput(options.bundleDir, manifest, "stderr")
  ]);

  const cwd = options.cwd ?? manifest.metadata.environment.cwd;
  const timeoutMs = options.timeoutMs ?? 60_000;

  const result = await runCommand({
    command: manifest.metadata.command!,
    args: manifest.metadata.args,
    cwd,
    env: options.env ?? process.env,
    timeoutMs
  });

  const replayStdoutArtifact = await writeArtifact(options.bundleDir, {
    fileName: "replay-stdout.txt",
    kind: "stdout",
    content: result.stdout,
    mimeType: "text/plain; charset=utf-8",
    description: "Replay stdout"
  });

  const replayStderrArtifact = await writeArtifact(options.bundleDir, {
    fileName: "replay-stderr.txt",
    kind: "stderr",
    content: result.stderr,
    mimeType: "text/plain; charset=utf-8",
    description: "Replay stderr"
  });

  const replayArtifacts = [replayStdoutArtifact, replayStderrArtifact];
  const nextManifest = mergeReplayArtifacts(manifest, replayArtifacts);
  await writeManifest(options.bundleDir, nextManifest);

  const assertions: ReplayAssertion[] = [];

  const timeoutAssertion = buildTimeoutAssertion(result.timedOut, timeoutMs, stepId);
  if (timeoutAssertion) {
    assertions.push(timeoutAssertion);
  }

  assertions.push(
    buildExitCodeAssertion({
      stepId,
      expectedExitCode,
      actualExitCode: result.exitCode,
      artifactRefs: [replayStdoutArtifact.id, replayStderrArtifact.id]
    })
  );

  assertions.push(
    buildTextAssertion({
      checkpointId: "checkpoint_stdout_text",
      stepId,
      label: "stdout",
      expected: expectedStdout.text,
      actual: result.stdout,
      artifactRefs: [
        ...(expectedStdout.artifactId ? [expectedStdout.artifactId] : []),
        replayStdoutArtifact.id
      ]
    })
  );

  assertions.push(
    buildTextAssertion({
      checkpointId: "checkpoint_stderr_text",
      stepId,
      label: "stderr",
      expected: expectedStderr.text,
      actual: result.stderr,
      artifactRefs: [
        ...(expectedStderr.artifactId ? [expectedStderr.artifactId] : []),
        replayStderrArtifact.id
      ]
    })
  );

  const failedAssertion = assertions.find((assertion) => !assertion.passed);

  const report: ReplayReport = {
    runId: manifest.runId,
    replayedAt: nowIso(),
    status: failedAssertion ? "failed" : "passed",
    divergenceStepId: failedAssertion ? stepId ?? firstStepId(events) : undefined,
    capabilities: resolveTraceCapabilities(manifest.metadata.source, manifest.capabilities),
    assertions
  };

  const reportPath = await writeReplayReport(options.bundleDir, report);

  return {
    report,
    reportPath,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode
  };
}

export async function replayBundle(options: ReplayBundleOptions): Promise<ReplayBundleResult> {
  const manifest = await readManifest(options.bundleDir);
  const events = await readEvents(options.bundleDir);

  if (manifest.metadata.source === "terminal") {
    return replayTerminalBundle(options);
  }

  return writeUnsupportedReplayReport({
    bundleDir: options.bundleDir,
    manifest,
    events,
    message: `Replay is not yet supported for '${manifest.metadata.source}' trace bundles.`
  });
}

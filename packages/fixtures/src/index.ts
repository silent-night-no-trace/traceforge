import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  parseReplayReport,
  type ArtifactRef,
  type ReplayAssertion,
  type ReplayReport,
  type TraceEvent,
  type TraceManifest
} from "@traceforge/schema";
import { readEvents, readManifest } from "@traceforge/core";

export type VitestTemplateOptions = {
  bundleDir: string;
  outputFile?: string | undefined;
  testName?: string | undefined;
  mcpServerCommand?: string | undefined;
  mcpServerArgs?: string[] | undefined;
};

export type VitestTemplateResult = {
  outputFile: string;
  content: string;
};

type AssertionPlan = {
  checkpointId: string;
  description: string;
  code: string;
};

type McpToolCase = {
  stepId: string;
  toolName: string;
  argumentsValue?: Record<string, unknown> | undefined;
  expectedOutput?: unknown;
  expectedFailure?: {
    message: string;
    kind: string;
  } | undefined;
};

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").trimEnd();
}

function escapeForTemplate(text: string): string {
  return JSON.stringify(text);
}

function replayGeneratedArtifactNames(): Set<string> {
  return new Set(["replay-stdout.txt", "replay-stderr.txt"]);
}

function normalizeTraceMode(
  manifest: TraceManifest,
  events: TraceEvent[]
): "terminal" | "mcp" | "browser" {
  if (manifest.metadata.source === "browser" || events.some((event) => event.source === "browser")) {
    return "browser";
  }

  if (manifest.metadata.source === "mcp" || events.some((event) => event.source === "mcp")) {
    return "mcp";
  }

  return "terminal";
}

async function readArtifactText(bundleDir: string, artifact: ArtifactRef): Promise<string> {
  return readFile(join(bundleDir, artifact.path), "utf8");
}

async function findArtifactText(
  bundleDir: string,
  artifacts: ArtifactRef[],
  kind: "stdout" | "stderr"
): Promise<string> {
  const ignored = replayGeneratedArtifactNames();
  const artifact = artifacts.find(
    (candidate) => candidate.kind === kind && !ignored.has(basename(candidate.path))
  );

  if (!artifact) {
    return "";
  }

  return readArtifactText(bundleDir, artifact);
}

async function findArtifactByDescription(
  bundleDir: string,
  artifacts: ArtifactRef[],
  description: string
): Promise<string | undefined> {
  const artifact = artifacts.find((candidate) => candidate.description === description);
  if (!artifact) {
    return undefined;
  }

  return readArtifactText(bundleDir, artifact);
}

async function readOptionalReplayReport(bundleDir: string): Promise<ReplayReport | undefined> {
  try {
    const raw = await readFile(join(bundleDir, "replay-report.json"), "utf8");
    return parseReplayReport(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function findExpectedExitCode(events: TraceEvent[]): number {
  for (const event of events) {
    if (event.type === "checkpoint.recorded" && event.checkpoint.kind === "exit-code") {
      if (typeof event.checkpoint.expected === "number") {
        return event.checkpoint.expected;
      }

      if (typeof event.checkpoint.actual === "number") {
        return event.checkpoint.actual;
      }
    }
  }

  for (const event of events) {
    if (event.type === "run.completed" && typeof event.exitCode === "number") {
      return event.exitCode;
    }
  }

  return 0;
}

function buildAssertionPlanFromReplay(
  assertion: ReplayAssertion,
  input: {
    expectedExitCode: number;
    expectedStdout: string;
    expectedStderr: string;
  }
): AssertionPlan {
  const description = `${assertion.checkpointId}: ${assertion.message ?? "generated from replay report"}`;

  switch (assertion.checkpointId) {
    case "checkpoint_exit_code":
      return {
        checkpointId: assertion.checkpointId,
        description,
        code: `    expect(result.exitCode).toBe(${input.expectedExitCode});`
      };
    case "checkpoint_stdout_text":
      return {
        checkpointId: assertion.checkpointId,
        description,
        code: `    expect(normalizeText(result.stdout)).toBe(${escapeForTemplate(normalizeText(input.expectedStdout))});`
      };
    case "checkpoint_stderr_text":
      return {
        checkpointId: assertion.checkpointId,
        description,
        code: `    expect(normalizeText(result.stderr)).toBe(${escapeForTemplate(normalizeText(input.expectedStderr))});`
      };
    default:
      return {
        checkpointId: assertion.checkpointId,
        description,
        code: `    expect(true).toBe(true);`
      };
  }
}

function buildTerminalAssertionPlans(input: {
  expectedExitCode: number;
  expectedStdout: string;
  expectedStderr: string;
  replayReport?: ReplayReport | undefined;
}): AssertionPlan[] {
  const fallbackPlans: AssertionPlan[] = [
    {
      checkpointId: "checkpoint_exit_code",
      description: "matches checkpoint_exit_code",
      code: `    expect(result.exitCode).toBe(${input.expectedExitCode});`
    },
    {
      checkpointId: "checkpoint_stdout_text",
      description: "matches checkpoint_stdout_text",
      code: `    expect(normalizeText(result.stdout)).toBe(${escapeForTemplate(normalizeText(input.expectedStdout))});`
    },
    {
      checkpointId: "checkpoint_stderr_text",
      description: "matches checkpoint_stderr_text",
      code: `    expect(normalizeText(result.stderr)).toBe(${escapeForTemplate(normalizeText(input.expectedStderr))});`
    }
  ];

  if (!input.replayReport) {
    return fallbackPlans;
  }

  const plans = input.replayReport.assertions.map((assertion) =>
    buildAssertionPlanFromReplay(assertion, input)
  );

  return plans.length > 0 ? plans : fallbackPlans;
}

function buildTerminalVitestTemplate(input: {
  command: string;
  args: string[];
  cwd: string;
  expectedExitCode: number;
  expectedStdout: string;
  expectedStderr: string;
  testName: string;
  bundleDir: string;
  replayReport?: ReplayReport | undefined;
}): string {
  const assertionPlans = buildTerminalAssertionPlans({
    expectedExitCode: input.expectedExitCode,
    expectedStdout: input.expectedStdout,
    expectedStderr: input.expectedStderr,
    replayReport: input.replayReport
  });

  const replayComment = input.replayReport
    ? `// Last replay status: ${input.replayReport.status}\n// Last replayed at: ${input.replayReport.replayedAt}\n`
    : "";

  return `import { spawn } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

function normalizeText(text: string): string {
  return text.replace(/\\r\\n/g, "\\n").trimEnd();
}

async function runCommand(command: string, args: string[], cwd: string) {
  return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.once("error", reject);
    child.once("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

describe(${escapeForTemplate(input.testName)}, () => {
  let result: CommandResult;

  beforeAll(async () => {
    result = await runCommand(
      ${escapeForTemplate(input.command)},
      ${JSON.stringify(input.args, null, 2)},
      ${escapeForTemplate(input.cwd)}
    );
  });

${assertionPlans
  .map(
    (plan) => `  it(${escapeForTemplate(plan.description)}, () => {
${plan.code}
  });`
  )
  .join("\n\n")}
});

// Generated by Traceforge from: ${input.bundleDir}
${replayComment}`;
}

function collectMcpToolCases(events: TraceEvent[]): McpToolCase[] {
  const cases: McpToolCase[] = [];

  for (const event of events) {
    if (event.type !== "tool.called" || event.source !== "mcp") {
      continue;
    }

    const matchingToolOutput = events.find(
      (candidate) =>
        candidate.type === "tool.output" &&
        candidate.source === "mcp" &&
        candidate.stepId === event.stepId &&
        candidate.toolName === event.toolName
    );

    const matchingFailure = events.find(
      (candidate) =>
        candidate.type === "step.failed" &&
        candidate.source === "mcp" &&
        candidate.stepId === event.stepId
    );

    cases.push({
      stepId: event.stepId ?? `step_${cases.length + 1}`,
      toolName: event.toolName,
      argumentsValue:
        event.input && typeof event.input === "object" && !Array.isArray(event.input)
          ? (event.input as Record<string, unknown>)
          : undefined,
      expectedOutput: matchingToolOutput?.type === "tool.output" ? matchingToolOutput.output : undefined,
      expectedFailure:
        matchingFailure?.type === "step.failed"
          ? {
              message: matchingFailure.error.message,
              kind: matchingFailure.error.kind
            }
          : undefined
    });
  }

  return cases;
}

function buildMcpServerCommandConfig(input: {
  manifest: TraceManifest;
  mcpServerCommand?: string | undefined;
  mcpServerArgs?: string[] | undefined;
}): { command: string; args: string[] } {
  if (input.mcpServerCommand) {
    return {
      command: input.mcpServerCommand,
      args: input.mcpServerArgs ?? []
    };
  }

  if (input.manifest.metadata.command) {
    return {
      command: input.manifest.metadata.command,
      args: input.manifest.metadata.args
    };
  }

  return {
    command: process.execPath,
    args: [resolve(process.cwd(), "examples", "mcp-server", "echo-server.mjs")]
  };
}

function buildMcpVitestTemplate(input: {
  manifest: TraceManifest;
  events: TraceEvent[];
  testName: string;
  bundleDir: string;
  mcpServerCommand?: string | undefined;
  mcpServerArgs?: string[] | undefined;
}): string {
  const toolCases = collectMcpToolCases(input.events);
  const server = buildMcpServerCommandConfig({
    manifest: input.manifest,
    mcpServerCommand: input.mcpServerCommand,
    mcpServerArgs: input.mcpServerArgs
  });

  return `import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectTracingStdioMcpClient } from "@traceforge/adapter-mcp";

type TracingClient = Awaited<ReturnType<typeof connectTracingStdioMcpClient>>;

let client: TracingClient;

describe(${escapeForTemplate(input.testName)}, () => {
  beforeAll(async () => {
    client = await connectTracingStdioMcpClient({
      command: ${escapeForTemplate(server.command)},
      args: ${JSON.stringify(server.args, null, 2)}
    });
  });

  afterAll(async () => {
    await client.close();
  });

${toolCases
  .map((toolCase) => {
    const outputExpectation = toolCase.expectedFailure
      ? `    expect(result.events.some((event) => event.type === "step.failed")).toBe(true);`
      : `    const outputEvent = result.events.find((event) => event.type === "tool.output");
    expect(outputEvent && JSON.stringify(outputEvent.output)).toBe(${escapeForTemplate(JSON.stringify(toolCase.expectedOutput ?? null))});`;

    return `  it(${escapeForTemplate(`calls MCP tool ${toolCase.toolName} for ${toolCase.stepId}`)}, async () => {
    const result = await client.callTool({
      context: {
        runId: "generated_mcp_run",
        stepId: ${escapeForTemplate(toolCase.stepId)},
        toolName: ${escapeForTemplate(toolCase.toolName)}
      },
      arguments: ${JSON.stringify(toolCase.argumentsValue ?? {}, null, 2)}
    });

    expect(result.events.some((event) => event.type === "tool.called")).toBe(true);
${outputExpectation}
  });`;
  })
  .join("\n\n")}
});

// Generated by Traceforge from: ${input.bundleDir}
  // MCP server command: ${server.command}
`;
}

function buildBrowserVitestTemplate(input: {
  finalUrl: string;
  expectedTitle: string;
  testName: string;
  bundleDir: string;
}): string {
  return `import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

let browser: Browser;
let context: BrowserContext;
let page: Page;

describe(${escapeForTemplate(input.testName)}, () => {
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });
    page = await context.newPage();
    await page.goto(${escapeForTemplate(input.finalUrl)}, { waitUntil: "networkidle" });
  });

  afterAll(async () => {
    await context.close();
    await browser.close();
  });

  it("navigates to the recorded final URL", async () => {
    expect(page.url()).toBe(${escapeForTemplate(input.finalUrl)});
  });

  it("matches the recorded page title", async () => {
    expect(await page.title()).toBe(${escapeForTemplate(input.expectedTitle)});
  });
});

// Generated by Traceforge from: ${input.bundleDir}
`;
}

export async function writeVitestRegressionTemplate(
  options: VitestTemplateOptions
): Promise<VitestTemplateResult> {
  const manifest = await readManifest(options.bundleDir);
  const events = await readEvents(options.bundleDir);
  const traceMode = normalizeTraceMode(manifest, events);

  if (traceMode === "terminal") {
    if (!manifest.metadata.command) {
      throw new Error("Trace bundle is missing the original command.");
    }

    const [expectedStdout, expectedStderr, replayReport] = await Promise.all([
      findArtifactText(options.bundleDir, manifest.artifacts, "stdout"),
      findArtifactText(options.bundleDir, manifest.artifacts, "stderr"),
      readOptionalReplayReport(options.bundleDir)
    ]);

    const expectedExitCode = findExpectedExitCode(events);
    const outputFile = options.outputFile ?? join(options.bundleDir, "traceforge.generated.test.ts");
    const testName =
      options.testName ??
      `Traceforge regression: ${manifest.metadata.command} ${manifest.metadata.args.join(" ")}`.trim();

    const content = buildTerminalVitestTemplate({
      command: manifest.metadata.command,
      args: manifest.metadata.args,
      cwd: manifest.metadata.environment.cwd,
      expectedExitCode,
      expectedStdout,
      expectedStderr,
      testName,
      bundleDir: options.bundleDir,
      replayReport
    });

    await writeFile(outputFile, content, "utf8");

    return {
      outputFile,
      content
    };
  }

  if (traceMode === "browser") {
    const metadataText = await findArtifactByDescription(
      options.bundleDir,
      manifest.artifacts,
      "Captured browser page metadata"
    );
    const metadata = metadataText
      ? (JSON.parse(metadataText) as {
          finalUrl?: string;
          title?: string;
        })
      : undefined;

    const browserAction = events.find(
      (event) => event.type === "browser.action" && event.action === "navigate"
    );

    const finalUrl =
      metadata?.finalUrl ??
      (browserAction?.type === "browser.action" ? browserAction.url : undefined) ??
      manifest.metadata.args[0];

    if (!finalUrl) {
      throw new Error("Browser trace bundle is missing the captured final URL.");
    }

    const expectedTitle = metadata?.title ?? "";
    const outputFile = options.outputFile ?? join(options.bundleDir, "traceforge.generated.test.ts");
    const testName =
      options.testName ?? `Traceforge browser regression: ${manifest.metadata.title ?? manifest.runId}`;

    const content = buildBrowserVitestTemplate({
      finalUrl,
      expectedTitle,
      testName,
      bundleDir: options.bundleDir
    });

    await writeFile(outputFile, content, "utf8");

    return {
      outputFile,
      content
    };
  }

  const outputFile = options.outputFile ?? join(options.bundleDir, "traceforge.generated.test.ts");
  const testName =
    options.testName ??
    `Traceforge MCP regression: ${manifest.metadata.title ?? manifest.runId}`;

  const content = buildMcpVitestTemplate({
    manifest,
    events,
    testName,
    bundleDir: options.bundleDir,
    mcpServerCommand: options.mcpServerCommand,
    mcpServerArgs: options.mcpServerArgs
  });

  await writeFile(outputFile, content, "utf8");

  return {
    outputFile,
    content
  };
}

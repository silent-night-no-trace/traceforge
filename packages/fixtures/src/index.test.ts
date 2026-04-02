import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTraceCapabilities } from "@traceforge/schema";
import { captureBrowserRun } from "@traceforge/adapter-browser";
import { captureTerminalRun } from "@traceforge/adapter-terminal";
import { createBundleWriter, replayTerminalBundle } from "@traceforge/core";
import { writeVitestRegressionTemplate } from "./index";

describe("writeVitestRegressionTemplate", () => {
  it("writes a terminal-focused Vitest template", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "traceforge-fixtures-"));

    const capture = await captureTerminalRun({
      command: process.execPath,
      args: ["-e", "process.stdout.write('fixture\\n'); process.exit(0)"],
      outputDir
    });

    const result = await writeVitestRegressionTemplate({
      bundleDir: capture.bundleDir
    });

    const content = await readFile(result.outputFile, "utf8");

    expect(content).toContain("matches checkpoint_exit_code");
    expect(content).toContain("matches checkpoint_stdout_text");
    expect(content).toContain("expect(result.exitCode).toBe(0)");
    expect(content).toContain("fixture");
  });

  it("uses replay-report assertions when available", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "traceforge-fixtures-replay-"));

    const capture = await captureTerminalRun({
      command: process.execPath,
      args: ["-e", "process.stdout.write('replayed\\n'); process.exit(0)"],
      outputDir
    });

    await replayTerminalBundle({
      bundleDir: capture.bundleDir
    });

    const result = await writeVitestRegressionTemplate({
      bundleDir: capture.bundleDir,
      outputFile: join(capture.bundleDir, "from-replay.generated.test.ts")
    });

    const content = await readFile(result.outputFile, "utf8");

    expect(content).toContain("checkpoint_stdout_text");
    expect(content).toContain("Last replay status: passed");
  });

  it("writes an MCP-focused Vitest template for mcp traces", async () => {
    const bundleDir = await mkdtemp(join(tmpdir(), "traceforge-fixtures-mcp-"));
    const writer = await createBundleWriter(bundleDir);
    const now = new Date().toISOString();

    await writer.writeManifest({
      schemaVersion: "0.1.0",
      runId: "run_mcp_fixture",
      createdAt: now,
      updatedAt: now,
      status: "passed",
      metadata: {
        title: "MCP fixture",
        command: process.execPath,
        args: [join(process.cwd(), "examples", "mcp-server", "echo-server.mjs")],
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
      eventCount: 4,
      artifactCount: 0,
      artifacts: [],
      redactionRules: []
    });

    await writer.appendEvent({
      type: "step.started",
      eventId: "evt_step",
      runId: "run_mcp_fixture",
      ts: now,
      source: "mcp",
      stepId: "step_mcp_echo",
      title: "call echo"
    });
    await writer.appendEvent({
      type: "tool.called",
      eventId: "evt_call",
      runId: "run_mcp_fixture",
      ts: now,
      source: "mcp",
      stepId: "step_mcp_echo",
      toolName: "echo",
      input: { message: "hello" }
    });
    await writer.appendEvent({
      type: "tool.output",
      eventId: "evt_output",
      runId: "run_mcp_fixture",
      ts: now,
      source: "mcp",
      stepId: "step_mcp_echo",
      toolName: "echo",
      output: {
        content: [{ type: "text", text: "hello" }],
        structuredContent: { echoed: "hello" }
      },
      isError: false,
      artifactRefs: []
    });
    await writer.appendEvent({
      type: "step.completed",
      eventId: "evt_done",
      runId: "run_mcp_fixture",
      ts: now,
      source: "mcp",
      stepId: "step_mcp_echo",
      status: "passed"
    });

    const result = await writeVitestRegressionTemplate({
      bundleDir,
      outputFile: join(bundleDir, "mcp.generated.test.ts")
    });

    const content = await readFile(result.outputFile, "utf8");

    expect(content).toContain("connectTracingStdioMcpClient");
    expect(content).toContain("calls MCP tool echo for step_mcp_echo");
    expect(content).toContain("echo-server.mjs");
  });

  it("writes a browser-focused Vitest template for browser traces", async (context) => {
    const outputDir = await mkdtemp(join(tmpdir(), "traceforge-fixtures-browser-"));

    try {
      const capture = await captureBrowserRun({
        url: "data:text/html,<title>Traceforge Browser Export</title><h1>Browser Export</h1>",
        outputDir,
        waitMs: 25,
        headless: true
      });

      const result = await writeVitestRegressionTemplate({
        bundleDir: capture.bundleDir,
        outputFile: join(capture.bundleDir, "browser.generated.test.ts")
      });

      const content = await readFile(result.outputFile, "utf8");

      expect(content).toContain('import { chromium');
      expect(content).toContain("matches the recorded page title");
      expect(content).toContain("Traceforge Browser Export");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Executable doesn't exist") || message.includes("browserType.launch")) {
        context.skip();
        return;
      }

      throw error;
    }
  });

  it("supports export-test across terminal, MCP, and browser bundles", async (context) => {
    const terminalDir = await mkdtemp(join(tmpdir(), "traceforge-fixtures-parity-terminal-"));
    const terminalCapture = await captureTerminalRun({
      command: process.execPath,
      args: ["-e", "process.stdout.write('parity terminal\\n'); process.exit(0)"],
      outputDir: terminalDir
    });

    const terminalTemplate = await writeVitestRegressionTemplate({
      bundleDir: terminalCapture.bundleDir,
      outputFile: join(terminalCapture.bundleDir, "parity-terminal.generated.test.ts")
    });

    const mcpBundleDir = await mkdtemp(join(tmpdir(), "traceforge-fixtures-parity-mcp-"));
    const mcpWriter = await createBundleWriter(mcpBundleDir);
    const now = new Date().toISOString();

    await mcpWriter.writeManifest({
      schemaVersion: "0.1.0",
      runId: "run_mcp_parity",
      createdAt: now,
      updatedAt: now,
      status: "passed",
      metadata: {
        title: "MCP parity",
        command: process.execPath,
        args: [join(process.cwd(), "examples", "mcp-server", "echo-server.mjs")],
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
      capabilities: createTraceCapabilities("mcp"),
      eventCount: 4,
      artifactCount: 0,
      artifacts: [],
      redactionRules: []
    });

    await mcpWriter.appendEvent({
      type: "step.started",
      eventId: "evt_mcp_step",
      runId: "run_mcp_parity",
      ts: now,
      source: "mcp",
      stepId: "step_mcp_echo",
      title: "call echo"
    });
    await mcpWriter.appendEvent({
      type: "tool.called",
      eventId: "evt_mcp_call",
      runId: "run_mcp_parity",
      ts: now,
      source: "mcp",
      stepId: "step_mcp_echo",
      toolName: "echo",
      input: { message: "parity mcp" }
    });
    await mcpWriter.appendEvent({
      type: "tool.output",
      eventId: "evt_mcp_output",
      runId: "run_mcp_parity",
      ts: now,
      source: "mcp",
      stepId: "step_mcp_echo",
      toolName: "echo",
      output: {
        content: [{ type: "text", text: "parity mcp" }],
        structuredContent: { echoed: "parity mcp" }
      },
      isError: false,
      artifactRefs: []
    });
    await mcpWriter.appendEvent({
      type: "step.completed",
      eventId: "evt_mcp_done",
      runId: "run_mcp_parity",
      ts: now,
      source: "mcp",
      stepId: "step_mcp_echo",
      status: "passed"
    });

    const mcpTemplate = await writeVitestRegressionTemplate({
      bundleDir: mcpBundleDir,
      outputFile: join(mcpBundleDir, "parity-mcp.generated.test.ts")
    });

    let browserTemplatePath: string | null = null;

    try {
      const browserDir = await mkdtemp(join(tmpdir(), "traceforge-fixtures-parity-browser-"));
      const browserCapture = await captureBrowserRun({
        url: "data:text/html,<title>Parity Browser</title><h1>Browser</h1>",
        outputDir: browserDir,
        waitMs: 25,
        headless: true
      });

      const browserTemplate = await writeVitestRegressionTemplate({
        bundleDir: browserCapture.bundleDir,
        outputFile: join(browserCapture.bundleDir, "parity-browser.generated.test.ts")
      });
      browserTemplatePath = browserTemplate.outputFile;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Executable doesn't exist") || message.includes("browserType.launch")) {
        context.skip();
        return;
      }

      throw error;
    }

    expect(terminalTemplate.outputFile).toContain("parity-terminal.generated.test.ts");
    expect(mcpTemplate.outputFile).toContain("parity-mcp.generated.test.ts");
    expect(browserTemplatePath).toContain("parity-browser.generated.test.ts");
  });
});

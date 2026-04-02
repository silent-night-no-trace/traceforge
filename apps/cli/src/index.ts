#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Command } from "commander";
import { captureBrowserRun } from "@traceforge/adapter-browser";
import { captureTerminalRun } from "@traceforge/adapter-terminal";
import { captureMcpToolRun, listMcpTools } from "@traceforge/adapter-mcp";
import { readManifest, replayBundle, startTraceViewServer } from "@traceforge/core";
import { writeVitestRegressionTemplate } from "@traceforge/fixtures";
import {
  collectRepeatedOption,
  parseJsonObjectOption,
  resolveBundleDirInput,
  trimTrailingSlash
} from "./utils";
import { openUrl, resolveViewerSession, type ViewOptions, type ViewerSession } from "./viewSupport";
import { buildViewPayload } from "./viewPayload";

export function createCli(): Command {
  const program = new Command();

  program
    .name("traceforge")
    .description("Replay and regression testing for AI agents")
    .version("0.0.0");

  program
    .command("capture")
    .description("Capture a command run into a trace bundle")
    .option("-o, --output <dir>", "output directory", ".traceforge/traces")
    .argument("<command>", "command to execute")
    .argument("[args...]", "command arguments")
    .action(async (command: string, args: string[], options: { output: string }) => {
      const outputDir = resolve(process.cwd(), options.output);
      const result = await captureTerminalRun({
        command,
        args,
        outputDir
      });

      console.log(`Trace bundle created at ${result.bundleDir}`);
      console.log(`Run status: ${result.status} (exit code ${result.exitCode})`);
    });

  program
    .command("capture-mcp")
    .description("Capture a real MCP tool call into a trace bundle")
    .requiredOption("--server-command <command>", "MCP server command")
    .option(
      "--server-arg <arg>",
      "MCP server argument (repeatable)",
      collectRepeatedOption,
      [] as string[]
    )
    .requiredOption("--tool <name>", "MCP tool name")
    .option("--args-json <json>", "JSON object of tool arguments", "{}")
    .option("-o, --output <dir>", "output directory", ".traceforge/traces")
    .action(
      async (options: {
        serverCommand: string;
        serverArg: string[];
        tool: string;
        argsJson: string;
        output: string;
      }) => {
        const outputDir = resolve(process.cwd(), options.output);
        const toolArguments = parseJsonObjectOption(options.argsJson);

        const result = await captureMcpToolRun({
          serverCommand: options.serverCommand,
          serverArgs: options.serverArg,
          toolName: options.tool,
          toolArguments,
          outputDir
        });

        console.log(`Trace bundle created at ${result.bundleDir}`);
        console.log(`Run status: ${result.status}`);
        console.log(`Captured MCP tool: ${result.toolName}`);
        console.log(`Event count: ${result.eventCount}`);
      }
    );

  program
    .command("capture-browser")
    .description("Capture a browser page visit into a trace bundle")
    .requiredOption("--url <url>", "URL to open in the browser")
    .option("--wait-ms <ms>", "extra wait time after navigation", "0")
    .option("--no-headless", "run the browser with UI for debugging")
    .option("-o, --output <dir>", "output directory", ".traceforge/traces")
    .action(
      async (options: {
        url: string;
        waitMs: string;
        headless: boolean;
        output: string;
      }) => {
        const outputDir = resolve(process.cwd(), options.output);

        const result = await captureBrowserRun({
          url: options.url,
          waitMs: Number(options.waitMs),
          headless: options.headless,
          outputDir
        });

        console.log(`Trace bundle created at ${result.bundleDir}`);
        console.log(`Run status: ${result.status}`);
        console.log(`Final URL: ${result.finalUrl}`);
        console.log(`Page title: ${result.title}`);
        console.log(`Event count: ${result.eventCount}`);
      }
    );

  program
    .command("list-mcp-tools")
    .description("List tools exposed by a stdio MCP server")
    .requiredOption("--server-command <command>", "MCP server command")
    .option(
      "--server-arg <arg>",
      "MCP server argument (repeatable)",
      collectRepeatedOption,
      [] as string[]
    )
    .option("--json", "print machine-readable JSON output")
    .action(
      async (options: {
        serverCommand: string;
        serverArg: string[];
        json?: boolean;
      }) => {
        const tools = await listMcpTools({
          serverCommand: options.serverCommand,
          serverArgs: options.serverArg
        });

        if (options.json) {
          console.log(JSON.stringify({ tools }));
          return;
        }

        if (tools.length === 0) {
          console.log("No MCP tools were reported by the server.");
          return;
        }

        for (const tool of tools) {
          console.log(`- ${tool.name}${tool.description ? `: ${tool.description}` : ""}`);
        }
      }
    );

  program
    .command("view")
    .description("Open a trace bundle in the local viewer")
    .option(
      "--viewer-url <url>",
      "viewer URL",
      process.env.TRACEFORGE_VIEWER_URL ?? "http://127.0.0.1:5173"
    )
    .option("--spawn-viewer", "start the local Vite viewer dev server before opening")
    .option("--no-open", "do not open the browser automatically")
    .option("--print-url", "print the resolved viewer URL for scripts and remote sessions")
    .option("--json", "print machine-readable JSON output")
    .argument("<bundleDir>", "trace bundle directory")
    .action(async (bundleDir: string, options: ViewOptions) => {
      const resolvedBundleDir = await resolveBundleDirInput(bundleDir);
      const bridge = await startTraceViewServer(resolvedBundleDir);
      const manifest = await readManifest(resolvedBundleDir);
      let viewerSession: ViewerSession | undefined;

      try {
        viewerSession = await resolveViewerSession(options);
        const activeViewerSession = viewerSession;

        const finalUrl =
          `${trimTrailingSlash(activeViewerSession.viewerUrl)}/?traceApi=` +
          encodeURIComponent(bridge.baseUrl);

        const payload = buildViewPayload({
          bundleDir: resolvedBundleDir,
          traceApi: bridge.baseUrl,
          viewerMode: activeViewerSession.mode,
          viewerUrl: finalUrl,
          opened: options.open,
          manifest
        });

        if (options.json) {
          console.log(JSON.stringify(payload));
        } else {
          console.log(`Trace bundle: ${resolvedBundleDir}`);
          console.log(`Trace API: ${bridge.baseUrl}`);
          console.log(`Viewer mode: ${activeViewerSession.mode}`);
          console.log(`Viewer URL: ${finalUrl}`);

          if (options.printUrl) {
            console.log(finalUrl);
          }
        }

        if (options.open) {
          await openUrl(finalUrl);
        }

        const shutdown = async (): Promise<void> => {
          await bridge.close();
          await activeViewerSession.close();
          process.exit(0);
        };

        process.once("SIGINT", () => void shutdown());
        process.once("SIGTERM", () => void shutdown());

        if (!options.json) {
          console.log(
            options.open
              ? "Viewer bridge is running. Press Ctrl+C to stop."
              : "Viewer bridge is running without opening a browser. Press Ctrl+C to stop."
          );
        }
      } catch (error) {
        await bridge.close();
        if (viewerSession) {
          await viewerSession.close();
        }
        throw error;
      }
    });

  program
    .command("replay")
    .description("Replay a trace bundle and write replay-report.json")
    .option("--cwd <dir>", "override replay working directory")
    .option("--timeout <ms>", "replay timeout in milliseconds", "60000")
    .argument("<bundleDir>", "trace bundle path")
    .action(
      async (
        bundleDir: string,
        options: {
          cwd?: string;
          timeout: string;
        }
      ) => {
        const resolvedBundleDir = resolve(process.cwd(), bundleDir);
        const replay = await replayBundle({
          bundleDir: resolvedBundleDir,
          cwd: options.cwd ? resolve(process.cwd(), options.cwd) : undefined,
          timeoutMs: Number(options.timeout)
        });

        console.log(`Replay report written to ${replay.reportPath}`);
        console.log(`Replay status: ${replay.report.status}`);
        console.log(`Replay exit code: ${replay.exitCode}`);

        if (replay.report.divergenceStepId) {
          console.log(`Divergence step: ${replay.report.divergenceStepId}`);
        }

        for (const assertion of replay.report.assertions) {
          console.log(
            `${assertion.passed ? "PASS" : "FAIL"} ${assertion.checkpointId}: ${assertion.message ?? ""}`
          );
        }

        if (replay.report.status === "failed") {
          process.exitCode = 1;
        }
      }
    );

  program
    .command("export-test")
    .description("Export a Vitest regression test from a trace bundle")
    .option("-o, --output <file>", "output test file path")
    .option("--name <name>", "override the generated test name")
    .option("--server-command <command>", "MCP server command for MCP trace templates")
    .option(
      "--server-arg <arg>",
      "MCP server argument for MCP trace templates (repeatable)",
      collectRepeatedOption,
      [] as string[]
    )
    .argument("<bundleDir>", "trace bundle path or run id")
    .action(
      async (
        bundleDir: string,
        options: {
          output?: string;
          name?: string;
          serverCommand?: string;
          serverArg: string[];
        }
      ) => {
        const resolvedBundleDir = await resolveBundleDirInput(bundleDir);
        const result = await writeVitestRegressionTemplate({
          bundleDir: resolvedBundleDir,
          outputFile: options.output ? resolve(process.cwd(), options.output) : undefined,
          testName: options.name,
          mcpServerCommand: options.serverCommand,
          mcpServerArgs: options.serverArg.length > 0 ? options.serverArg : undefined
        });

        console.log(`Vitest regression template written to ${result.outputFile}`);
      }
    );

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  await createCli().parseAsync(argv);
}

function isDirectExecution(metaUrl = import.meta.url, argv = process.argv): boolean {
  const entryPath = argv[1];
  if (!entryPath) {
    return false;
  }

  return resolve(entryPath) === resolve(fileURLToPath(metaUrl));
}

if (isDirectExecution()) {
  void runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}

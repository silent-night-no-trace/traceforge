import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readEvents, readManifest } from "@traceforge/core";
import {
  captureMcpToolRun,
  createMcpFailureEvent,
  createMcpRequestEvent,
  createTracingMcpClient,
  listMcpTools,
  traceMcpToolCall
} from "./index";

describe("adapter-mcp", () => {
  it("creates an MCP request event", () => {
    const event = createMcpRequestEvent(
      {
        runId: "run_123",
        stepId: "step_mcp",
        toolName: "search_docs"
      },
      {
        method: "tools/call",
        payload: { name: "search_docs" }
      }
    );

    expect(event.type).toBe("mcp.message");
    expect(event.source).toBe("mcp");
  });

  it("wraps a successful tool call into trace events", async () => {
    const result = await traceMcpToolCall({
      client: {
        callTool: async () => ({ ok: true, content: "done" })
      },
      context: {
        runId: "run_123",
        stepId: "step_mcp",
        toolName: "search_docs"
      },
      arguments: { query: "foo" }
    });

    expect(result.events.some((event) => event.type === "tool.called")).toBe(true);
    expect(result.events.some((event) => event.type === "tool.output")).toBe(true);
  });

  it("creates a failure event with the right error kind", () => {
    const event = createMcpFailureEvent(
      {
        runId: "run_123",
        stepId: "step_mcp",
        toolName: "search_docs"
      },
      {
        message: "Protocol blew up",
        kind: "protocol"
      }
    );

    expect(event.type).toBe("step.failed");
    if (event.type === "step.failed") {
      expect(event.error.kind).toBe("protocol");
    }
  });

  it("emits traced events through the tracing client wrapper", async () => {
    const emitted: string[] = [];

    const client = createTracingMcpClient({
      client: {
        callTool: async () => ({ isError: false, content: [{ type: "text", text: "ok" }] }),
        close: async () => undefined
      },
      emitEvents: async (events) => {
        emitted.push(...events.map((event) => event.type));
      }
    });

    const result = await client.callTool({
      context: {
        runId: "run_123",
        stepId: "step_mcp",
        toolName: "search_docs"
      },
      arguments: { query: "foo" }
    });

    expect(result.events.length).toBeGreaterThan(0);
    expect(emitted).toContain("mcp.message");
    expect(emitted).toContain("tool.called");
    expect(emitted).toContain("tool.output");
  });

  it("captures a successful MCP tool call into a bundle", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "traceforge-mcp-capture-"));
    const serverPath = join(process.cwd(), "examples", "mcp-server", "echo-server.mjs");

    const capture = await captureMcpToolRun({
      serverCommand: process.execPath,
      serverArgs: [serverPath],
      toolName: "echo",
      toolArguments: { message: "hello from test" },
      outputDir
    });

    expect(capture.status).toBe("passed");

    const manifest = await readManifest(capture.bundleDir);
    const events = await readEvents(capture.bundleDir);

    expect(manifest.metadata.source).toBe("mcp");
    expect(events.some((event) => event.type === "mcp.message")).toBe(true);
    expect(events.some((event) => event.type === "tool.called")).toBe(true);
    expect(events.some((event) => event.type === "tool.output")).toBe(true);
    expect(events.some((event) => event.type === "run.completed")).toBe(true);
  });

  it("captures a failing MCP tool call into a bundle", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "traceforge-mcp-capture-fail-"));
    const serverPath = join(process.cwd(), "examples", "mcp-server", "echo-server.mjs");

    const capture = await captureMcpToolRun({
      serverCommand: process.execPath,
      serverArgs: [serverPath],
      toolName: "missing_tool",
      toolArguments: {},
      outputDir
    });

    expect(capture.status).toBe("failed");

    const manifest = await readManifest(capture.bundleDir);
    const events = await readEvents(capture.bundleDir);

    expect(manifest.status).toBe("failed");
    expect(events.some((event) => event.type === "step.failed")).toBe(true);
  });

  it("lists tools from the sample MCP server", async () => {
    const serverPath = join(process.cwd(), "examples", "mcp-server", "echo-server.mjs");

    const tools = await listMcpTools({
      serverCommand: process.execPath,
      serverArgs: [serverPath]
    });

    expect(tools.some((tool) => tool.name === "echo")).toBe(true);
    expect(tools.some((tool) => tool.name === "sum")).toBe(true);
  });
});

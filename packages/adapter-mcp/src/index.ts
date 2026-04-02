import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createBundleWriter, writeArtifact } from "@traceforge/core";
import {
  createTraceCapabilities,
  createEventId,
  createRunId,
  nowIso,
  TRACEFORGE_SCHEMA_VERSION,
  type ArtifactRef,
  type TraceManifest,
  type TraceEvent
} from "@traceforge/schema";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export type McpTraceContext = {
  runId: string;
  stepId: string;
  toolName: string;
  ts?: string | undefined;
};

export type McpRequestLike = {
  method?: string | undefined;
  payload?: unknown;
};

export type McpResponseLike = {
  method?: string | undefined;
  payload?: unknown;
  isError?: boolean | undefined;
};

export type McpErrorLike = {
  message: string;
  code?: string | number | undefined;
  kind?: "protocol" | "sdk" | "tool" | "runtime" | undefined;
  details?: unknown;
};

export type McpCallToolResultLike = {
  isError?: boolean | undefined;
  content?: unknown;
  structuredContent?: unknown;
  [key: string]: unknown;
};

export type TraceableMcpClient<Result> = {
  callTool: (input: { name: string; arguments?: Record<string, unknown> }) => Promise<Result>;
  listTools?: (() => Promise<{ tools: Array<{ name: string; description?: string | undefined }> }>) | undefined;
  close?: (() => Promise<void>) | undefined;
};

export type TraceEventSink = (events: TraceEvent[]) => void | Promise<void>;

export type TracingMcpClient<Result> = {
  rawClient: TraceableMcpClient<Result>;
  callTool: (input: {
    context: McpTraceContext;
    arguments?: Record<string, unknown> | undefined;
    mapResult?: ((result: Result) => unknown) | undefined;
  }) => Promise<{ result?: Result; events: TraceEvent[] }>;
  close: () => Promise<void>;
};

export type ConnectTracingStdioMcpClientOptions = {
  command: string;
  args?: string[] | undefined;
  clientName?: string | undefined;
  clientVersion?: string | undefined;
  emitEvents?: TraceEventSink | undefined;
};

export type CaptureMcpToolOptions = {
  serverCommand: string;
  serverArgs?: string[] | undefined;
  toolName: string;
  toolArguments?: Record<string, unknown> | undefined;
  outputDir: string;
  cwd?: string | undefined;
};

export type CaptureMcpToolResult = {
  runId: string;
  bundleDir: string;
  status: "passed" | "failed";
  toolName: string;
  eventCount: number;
};

export type ListedMcpTool = {
  name: string;
  description?: string | undefined;
};

export function classifyMcpError(error: McpErrorLike): "protocol" | "sdk" | "tool" | "runtime" {
  return error.kind ?? "runtime";
}

export function classifyThrownMcpError(error: unknown): "protocol" | "sdk" | "runtime" {
  if (error instanceof Error && error.name === "ProtocolError") {
    return "protocol";
  }

  if (error instanceof Error && error.name === "SdkError") {
    return "sdk";
  }

  return "runtime";
}

export function createMcpRequestEvent(
  context: McpTraceContext,
  request: McpRequestLike
): TraceEvent {
  return {
    type: "mcp.message",
    eventId: createEventId(),
    runId: context.runId,
    ts: context.ts ?? nowIso(),
    source: "mcp",
    stepId: context.stepId,
    direction: "request",
    method: request.method,
    payload: request.payload
  };
}

export function createMcpResponseEvent(
  context: McpTraceContext,
  response: McpResponseLike
): TraceEvent {
  return {
    type: "mcp.message",
    eventId: createEventId(),
    runId: context.runId,
    ts: context.ts ?? nowIso(),
    source: "mcp",
    stepId: context.stepId,
    direction: "response",
    method: response.method,
    payload: response.payload
  };
}

export function createMcpToolCalledEvent(
  context: McpTraceContext,
  input: Record<string, unknown> | undefined
): TraceEvent {
  return {
    type: "tool.called",
    eventId: createEventId(),
    runId: context.runId,
    ts: context.ts ?? nowIso(),
    source: "mcp",
    stepId: context.stepId,
    toolName: context.toolName,
    input
  };
}

export function createMcpToolOutputEvent(
  context: McpTraceContext,
  output: unknown,
  isError = false
): TraceEvent {
  return {
    type: "tool.output",
    eventId: createEventId(),
    runId: context.runId,
    ts: context.ts ?? nowIso(),
    source: "mcp",
    stepId: context.stepId,
    toolName: context.toolName,
    output,
    isError,
    artifactRefs: []
  };
}

export function createMcpFailureEvent(
  context: McpTraceContext,
  error: McpErrorLike
): TraceEvent {
  return {
    type: "step.failed",
    eventId: createEventId(),
    runId: context.runId,
    ts: context.ts ?? nowIso(),
    source: "mcp",
    stepId: context.stepId,
    error: {
      kind: classifyMcpError(error),
      message: error.message,
      code: error.code !== undefined ? String(error.code) : undefined,
      details: error.details
    },
    artifactRefs: []
  };
}

async function emitEvents(
  sink: TraceEventSink | undefined,
  events: TraceEvent[]
): Promise<void> {
  if (!sink) {
    return;
  }

  await sink(events);
}

export async function traceMcpToolCall<Result>(input: {
  client: TraceableMcpClient<Result>;
  context: McpTraceContext;
  arguments?: Record<string, unknown> | undefined;
  mapResult?: ((result: Result) => unknown) | undefined;
}): Promise<{ result?: Result; events: TraceEvent[] }> {
  const requestEvent = createMcpRequestEvent(input.context, {
    method: "tools/call",
    payload: {
      name: input.context.toolName,
      arguments: input.arguments
    }
  });

  const toolCalledEvent = createMcpToolCalledEvent(input.context, input.arguments);

  try {
    const result = await input.client.callTool({
      name: input.context.toolName,
      ...(input.arguments ? { arguments: input.arguments } : {})
    });

    const responseEvent = createMcpResponseEvent(input.context, {
      method: "tools/call",
      payload: result
    });

    const mappedResult = input.mapResult ? input.mapResult(result) : result;
    const toolOutputEvent = createMcpToolOutputEvent(
      input.context,
      mappedResult,
      Boolean((result as McpCallToolResultLike).isError)
    );

    const events = [requestEvent, toolCalledEvent, responseEvent, toolOutputEvent];

    if ((result as McpCallToolResultLike).isError) {
      events.push(
        createMcpFailureEvent(input.context, {
          message: "MCP tool returned isError=true",
          kind: "tool",
          details: result
        })
      );
    }

    return {
      result,
      events
    };
  } catch (error) {
    const failure = createMcpFailureEvent(input.context, {
      message: error instanceof Error ? error.message : String(error),
      kind: classifyThrownMcpError(error),
      details: error
    });

    return {
      events: [requestEvent, toolCalledEvent, failure]
    };
  }
}

export function createTracingMcpClient<Result>(input: {
  client: TraceableMcpClient<Result>;
  emitEvents?: TraceEventSink | undefined;
}): TracingMcpClient<Result> {
  return {
    rawClient: input.client,
    async callTool({ context, arguments: toolArguments, mapResult }) {
      const traced = await traceMcpToolCall({
        client: input.client,
        context,
        arguments: toolArguments,
        mapResult
      });

      await emitEvents(input.emitEvents, traced.events);
      return traced;
    },
    async close() {
      await input.client.close?.();
    }
  };
}

export async function connectTracingStdioMcpClient(
  options: ConnectTracingStdioMcpClientOptions
): Promise<TracingMcpClient<McpCallToolResultLike>> {
  const client = new Client({
    name: options.clientName ?? "traceforge-adapter",
    version: options.clientVersion ?? "0.1.0"
  });

  const transport = new StdioClientTransport({
    command: options.command,
    args: options.args ?? []
  });

  await client.connect(transport);

  return createTracingMcpClient<McpCallToolResultLike>({
    client: {
      callTool: (input) => client.callTool(input),
      listTools: async () => {
        const result = await client.listTools();
        return {
          tools: result.tools.map((tool) => ({
            name: tool.name,
            description: "description" in tool && typeof tool.description === "string"
              ? tool.description
              : undefined
          }))
        };
      },
      close: async () => {
        await client.close();
      }
    },
    emitEvents: options.emitEvents
  });
}

export async function listMcpTools(input: {
  serverCommand: string;
  serverArgs?: string[] | undefined;
}): Promise<ListedMcpTool[]> {
  const client = await connectTracingStdioMcpClient({
    command: input.serverCommand,
    args: input.serverArgs,
    clientName: "traceforge-list-tools",
    clientVersion: "0.1.0"
  });

  try {
    const listed = await client.rawClient.listTools?.();
    return listed?.tools ?? [];
  } finally {
    await client.close();
  }
}

export async function captureMcpToolRun(
  options: CaptureMcpToolOptions
): Promise<CaptureMcpToolResult> {
  const runId = createRunId();
  const startedAt = nowIso();
  const stepId = `step_mcp_${options.toolName}`;
  const bundleDir = join(options.outputDir, runId);

  await mkdir(bundleDir, { recursive: true });

  const writer = await createBundleWriter(bundleDir);
  let eventCount = 0;

  const manifest: TraceManifest = {
    schemaVersion: TRACEFORGE_SCHEMA_VERSION,
    runId,
    createdAt: startedAt,
    updatedAt: startedAt,
    status: "running",
    metadata: {
      title: `mcp:${options.toolName}`,
      command: options.serverCommand,
      args: options.serverArgs ?? [],
      source: "mcp",
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
      tags: ["mcp", options.toolName]
    },
    capabilities: createTraceCapabilities("mcp"),
    eventCount: 0,
    artifactCount: 0,
    artifacts: [],
    redactionRules: []
  };

  const artifacts: ArtifactRef[] = [];

  async function pushEvent(event: TraceEvent): Promise<void> {
    await writer.appendEvent(event);
    eventCount += 1;
  }

  if (options.toolArguments) {
    artifacts.push(
      await writeArtifact(bundleDir, {
        fileName: `${options.toolName}-input.json`,
        kind: "json",
        content: JSON.stringify(options.toolArguments, null, 2),
        mimeType: "application/json; charset=utf-8",
        description: `MCP tool input for ${options.toolName}`
      })
    );
  }

  await pushEvent({
    type: "run.started",
    eventId: createEventId(),
    runId,
    ts: startedAt,
    source: "mcp",
    metadata: manifest.metadata
  });

  await pushEvent({
    type: "step.started",
    eventId: createEventId(),
    runId,
    ts: startedAt,
    source: "mcp",
    stepId,
    title: `call MCP tool ${options.toolName}`
  });

  await writer.writeManifest({ ...manifest, eventCount });

  const client = await connectTracingStdioMcpClient({
    command: options.serverCommand,
    args: options.serverArgs,
    clientName: "traceforge-capture",
    clientVersion: "0.1.0"
  });

  try {
    const listedTools = await client.rawClient.listTools?.();
    const availableTools = listedTools?.tools ?? [];

    if (availableTools.length > 0 && !availableTools.some((tool) => tool.name === options.toolName)) {
      const finishedAt = nowIso();
      const toolsArtifact = await writeArtifact(bundleDir, {
        fileName: "mcp-tools.json",
        kind: "json",
        content: JSON.stringify(availableTools, null, 2),
        mimeType: "application/json; charset=utf-8",
        description: "Available MCP tools"
      });
      artifacts.push(toolsArtifact);

      await pushEvent({
        type: "step.failed",
        eventId: createEventId(),
        runId,
        ts: finishedAt,
        source: "mcp",
        stepId,
        error: {
          kind: "tool",
          message: `MCP tool '${options.toolName}' was not found on the connected server.`,
          details: {
            availableTools: availableTools.map((tool) => tool.name)
          }
        },
        artifactRefs: [toolsArtifact.id]
      });

      await pushEvent({
        type: "step.completed",
        eventId: createEventId(),
        runId,
        ts: finishedAt,
        source: "mcp",
        stepId,
        status: "failed"
      });

      await pushEvent({
        type: "run.completed",
        eventId: createEventId(),
        runId,
        ts: finishedAt,
        source: "mcp",
        status: "failed"
      });

      await writer.writeManifest({
        ...manifest,
        updatedAt: finishedAt,
        status: "failed",
        eventCount,
        artifactCount: artifacts.length,
        artifacts
      });

      return {
        runId,
        bundleDir,
        status: "failed",
        toolName: options.toolName,
        eventCount
      };
    }

    const traced = await client.callTool({
      context: {
        runId,
        stepId,
        toolName: options.toolName
      },
      arguments: options.toolArguments,
      mapResult: (result) => result
    });

    let outputArtifact: ArtifactRef | undefined;
    let failureArtifact: ArtifactRef | undefined;

    if (traced.result !== undefined) {
      outputArtifact = await writeArtifact(bundleDir, {
        fileName: `${options.toolName}-output.json`,
        kind: "json",
        content: JSON.stringify(traced.result, null, 2),
        mimeType: "application/json; charset=utf-8",
        description: `MCP tool output for ${options.toolName}`
      });
      artifacts.push(outputArtifact);
    }

    const normalizedEvents = traced.events.map((event) => {
      if (event.type === "tool.output" && outputArtifact) {
        return {
          ...event,
          artifactRefs: [...event.artifactRefs, outputArtifact.id]
        } satisfies TraceEvent;
      }

      if (event.type === "step.failed") {
        if (!failureArtifact) {
          return event;
        }

        return {
          ...event,
          artifactRefs: [...event.artifactRefs, failureArtifact.id]
        } satisfies TraceEvent;
      }

      return event;
    });

    for (const event of normalizedEvents) {
      if (event.type === "step.failed" && !failureArtifact) {
        failureArtifact = await writeArtifact(bundleDir, {
          fileName: `${options.toolName}-failure.json`,
          kind: "json",
          content: JSON.stringify(event.error, null, 2),
          mimeType: "application/json; charset=utf-8",
          description: `MCP failure for ${options.toolName}`
        });
        artifacts.push(failureArtifact);
      }

      await pushEvent(
        event.type === "step.failed" && failureArtifact
          ? {
              ...event,
              artifactRefs: [...event.artifactRefs, failureArtifact.id]
            }
          : event
      );
    }

    const status: "passed" | "failed" = normalizedEvents.some((event) => event.type === "step.failed")
      ? "failed"
      : "passed";
    const finishedAt = nowIso();

    await pushEvent({
      type: "step.completed",
      eventId: createEventId(),
      runId,
      ts: finishedAt,
      source: "mcp",
      stepId,
      status
    });

    await pushEvent({
      type: "run.completed",
      eventId: createEventId(),
      runId,
      ts: finishedAt,
      source: "mcp",
      status
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
      status,
      toolName: options.toolName,
      eventCount
    };
  } finally {
    await client.close();
  }
}

import type {
  CapabilityDescriptor,
  TraceCapabilities,
  TraceEvent,
  TraceSource
} from "@traceforge/schema";
import type { LoadedTraceBundle } from "./loadTraceBundle";
import type { OutputBlockItem } from "./renderableTimeline";

export type SourceFilter = "all" | TraceSource;

export type FocusedOutputTarget = {
  stepId: string;
  stream: "stdout" | "stderr" | "console" | "network";
};

export function directArtifactIdsForEvent(event: TraceEvent): string[] {
  switch (event.type) {
    case "output.chunk":
      return event.artifactRef ? [event.artifactRef] : [];
    case "tool.output":
    case "browser.action":
    case "step.failed":
      return event.artifactRefs;
    case "checkpoint.recorded":
      return event.checkpoint.artifactRefs;
    default:
      return [];
  }
}

export function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function buildStepArtifactIndex(events: TraceEvent[]): Record<string, string[]> {
  const stepMap = new Map<string, Set<string>>();

  for (const event of events) {
    if (!event.stepId) {
      continue;
    }

    const artifactIds = directArtifactIdsForEvent(event);
    if (artifactIds.length === 0) {
      continue;
    }

    const existing = stepMap.get(event.stepId) ?? new Set<string>();
    for (const artifactId of artifactIds) {
      existing.add(artifactId);
    }
    stepMap.set(event.stepId, existing);
  }

  return Object.fromEntries([...stepMap.entries()].map(([stepId, ids]) => [stepId, [...ids]]));
}

export function relatedArtifactIdsForEvent(
  event: TraceEvent,
  stepArtifactIndex: Record<string, string[]>
): string[] {
  const direct = directArtifactIdsForEvent(event);
  if (direct.length > 0) {
    return unique(direct);
  }

  if (event.stepId) {
    return stepArtifactIndex[event.stepId] ?? [];
  }

  return [];
}

export function formatEventTitle(event: TraceEvent): string {
  switch (event.type) {
    case "run.started":
      return "Run started";
    case "step.started":
      return event.title;
    case "output.chunk":
      return `${event.stream} output`;
    case "tool.called":
      return `Tool called: ${event.toolName}`;
    case "tool.output":
      return `Tool output: ${event.toolName}`;
    case "browser.action":
      return `Browser action: ${event.action}`;
    case "mcp.message":
      return `MCP ${event.direction}${event.method ? `: ${event.method}` : ""}`;
    case "checkpoint.recorded":
      return `Checkpoint: ${event.checkpoint.label}`;
    case "step.failed":
      return `Step failed: ${event.error.message}`;
    case "step.completed":
      return `Step completed: ${event.status}`;
    case "run.completed":
      return `Run completed: ${event.status}`;
    default:
      return "event";
  }
}

export function formatEventDetail(event: TraceEvent): string | null {
  switch (event.type) {
    case "output.chunk":
      return event.text.trim() || "(empty chunk)";
    case "tool.called":
      return event.input ? JSON.stringify(event.input, null, 2) : "No tool input";
    case "tool.output":
      return event.output ? JSON.stringify(event.output, null, 2) : "No tool output";
    case "browser.action":
      return [event.url, event.selector].filter(Boolean).join(" | ") || "No browser metadata";
    case "mcp.message":
      return event.payload ? JSON.stringify(event.payload, null, 2) : "No MCP payload";
    case "checkpoint.recorded":
      return JSON.stringify(
        {
          expected: event.checkpoint.expected,
          actual: event.checkpoint.actual,
          passed: event.checkpoint.passed
        },
        null,
        2
      );
    case "step.failed":
      return JSON.stringify(event.error, null, 2);
    default:
      return null;
  }
}

export function eventTone(event: TraceEvent): "neutral" | "success" | "danger" | "warning" {
  switch (event.type) {
    case "step.failed":
      return "danger";
    case "run.completed":
      return event.status === "passed" ? "success" : "danger";
    case "checkpoint.recorded":
      return event.checkpoint.passed === false ? "warning" : "success";
    case "step.completed":
      return event.status === "passed" ? "success" : "warning";
    default:
      return "neutral";
  }
}

export function relatedArtifactIdsForOutputBlock(block: OutputBlockItem, trace: LoadedTraceBundle): string[] {
  if (block.artifactIds.length > 0) {
    return unique(block.artifactIds);
  }

  if (block.stream !== "stdout" && block.stream !== "stderr") {
    return [];
  }

  return unique(
    trace.manifest.artifacts
      .filter((artifact) => artifact.kind === block.stream)
      .map((artifact) => artifact.id)
  );
}

export function formatCapabilityLabel(descriptor: CapabilityDescriptor): string {
  switch (descriptor.status) {
    case "supported":
      return "supported";
    case "partial":
      return "partial";
    case "unsupported":
      return "unsupported";
    default:
      return descriptor.status;
  }
}

export function capabilityRows(capabilities: TraceCapabilities): Array<{
  label: string;
  value: string;
  tone: CapabilityDescriptor["status"] | "source";
  reason?: string | undefined;
}> {
  return [
    { label: "Source", value: capabilities.source, tone: "source" },
    {
      label: "Replay",
      value: formatCapabilityLabel(capabilities.replay),
      tone: capabilities.replay.status,
      reason: capabilities.replay.reason
    },
    {
      label: "Export test",
      value: formatCapabilityLabel(capabilities.exportTest),
      tone: capabilities.exportTest.status,
      reason: capabilities.exportTest.reason
    },
    {
      label: "View",
      value: formatCapabilityLabel(capabilities.view),
      tone: capabilities.view.status,
      reason: capabilities.view.reason
    }
  ];
}

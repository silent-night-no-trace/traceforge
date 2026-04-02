import { z } from "zod";

export const TRACEFORGE_SCHEMA_VERSION = "0.1.0";

export const TraceSourceSchema = z.enum(["terminal", "mcp", "browser"]);
export const RunStatusSchema = z.enum(["running", "passed", "failed", "cancelled"]);
export const ArtifactKindSchema = z.enum([
  "stdout",
  "stderr",
  "screenshot",
  "json",
  "text",
  "html",
  "dom-snapshot",
  "network-log",
  "attachment"
]);
export const ErrorKindSchema = z.enum([
  "runtime",
  "tool",
  "protocol",
  "sdk",
  "assertion",
  "timeout",
  "unknown"
]);
export const CheckpointKindSchema = z.enum([
  "exit-code",
  "tool-sequence",
  "json-shape",
  "file-content",
  "dom-assertion",
  "text-match",
  "screenshot-ref"
]);

export const RedactionRuleSchema = z.object({
  id: z.string(),
  kind: z.enum(["env", "pattern", "literal"]),
  pattern: z.string(),
  replacement: z.string().default("[REDACTED]")
});

export const EnvironmentFingerprintSchema = z.object({
  platform: z.string(),
  arch: z.string(),
  nodeVersion: z.string(),
  shell: z.string().optional(),
  cwd: z.string(),
  ci: z.boolean().default(false)
});

export const ToolVersionSchema = z.object({
  name: z.string(),
  version: z.string()
});

export const CapabilityStatusSchema = z.enum(["supported", "unsupported", "partial"]);

export const CapabilityDescriptorSchema = z.object({
  status: CapabilityStatusSchema,
  reason: z.string().optional()
});

const LegacyTraceCapabilitiesSchema = z.object({
  source: TraceSourceSchema,
  supportsReplay: z.boolean(),
  supportsExportTest: z.boolean(),
  supportsView: z.boolean()
});

const CanonicalTraceCapabilitiesSchema = z.object({
  source: TraceSourceSchema,
  replay: CapabilityDescriptorSchema,
  exportTest: CapabilityDescriptorSchema,
  view: CapabilityDescriptorSchema
});

type CanonicalTraceCapabilities = z.infer<typeof CanonicalTraceCapabilitiesSchema>;

export const TraceCapabilitiesSchema = z
  .union([CanonicalTraceCapabilitiesSchema, LegacyTraceCapabilitiesSchema])
  .transform((value): CanonicalTraceCapabilities => {
    if ("replay" in value) {
      return value;
    }

    return {
      source: value.source,
      replay: capabilityDescriptor(value.supportsReplay ? "supported" : "unsupported"),
      exportTest: capabilityDescriptor(value.supportsExportTest ? "supported" : "unsupported"),
      view: capabilityDescriptor(value.supportsView ? "supported" : "unsupported")
    };
  });

function capabilityDescriptor(
  status: CanonicalTraceCapabilities["replay"]["status"],
  reason?: string | undefined
): CanonicalTraceCapabilities["replay"] {
  return reason ? { status, reason } : { status };
}

export const RunMetadataSchema = z.object({
  title: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  source: TraceSourceSchema,
  startedAt: z.string(),
  environment: EnvironmentFingerprintSchema,
  tools: z.array(ToolVersionSchema).default([]),
  tags: z.array(z.string()).default([])
});

export const ArtifactRefSchema = z.object({
  id: z.string(),
  kind: ArtifactKindSchema,
  path: z.string(),
  sha256: z.string(),
  mimeType: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  description: z.string().optional()
});

export const StructuredErrorSchema = z.object({
  kind: ErrorKindSchema,
  message: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional()
});

export const CheckpointSchema = z.object({
  id: z.string(),
  kind: CheckpointKindSchema,
  label: z.string(),
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  passed: z.boolean().optional(),
  artifactRefs: z.array(z.string()).default([])
});

const EventBaseSchema = z.object({
  eventId: z.string(),
  runId: z.string(),
  ts: z.string(),
  source: TraceSourceSchema,
  stepId: z.string().optional(),
  parentStepId: z.string().optional()
});

export const RunStartedEventSchema = EventBaseSchema.extend({
  type: z.literal("run.started"),
  metadata: RunMetadataSchema
});

export const StepStartedEventSchema = EventBaseSchema.extend({
  type: z.literal("step.started"),
  title: z.string(),
  detail: z.string().optional()
});

export const OutputChunkEventSchema = EventBaseSchema.extend({
  type: z.literal("output.chunk"),
  stream: z.enum(["stdout", "stderr", "console", "network"]),
  text: z.string(),
  artifactRef: z.string().optional()
});

export const ToolCalledEventSchema = EventBaseSchema.extend({
  type: z.literal("tool.called"),
  toolName: z.string(),
  input: z.unknown().optional()
});

export const ToolOutputEventSchema = EventBaseSchema.extend({
  type: z.literal("tool.output"),
  toolName: z.string(),
  output: z.unknown().optional(),
  isError: z.boolean().default(false),
  artifactRefs: z.array(z.string()).default([])
});

export const BrowserActionEventSchema = EventBaseSchema.extend({
  type: z.literal("browser.action"),
  action: z.string(),
  url: z.string().optional(),
  selector: z.string().optional(),
  artifactRefs: z.array(z.string()).default([])
});

export const McpMessageEventSchema = EventBaseSchema.extend({
  type: z.literal("mcp.message"),
  direction: z.enum(["request", "response", "notification"]),
  method: z.string().optional(),
  payload: z.unknown().optional()
});

export const CheckpointRecordedEventSchema = EventBaseSchema.extend({
  type: z.literal("checkpoint.recorded"),
  checkpoint: CheckpointSchema
});

export const StepFailedEventSchema = EventBaseSchema.extend({
  type: z.literal("step.failed"),
  error: StructuredErrorSchema,
  artifactRefs: z.array(z.string()).default([])
});

export const StepCompletedEventSchema = EventBaseSchema.extend({
  type: z.literal("step.completed"),
  status: z.enum(["passed", "failed", "cancelled"]),
  durationMs: z.number().int().nonnegative().optional()
});

export const RunCompletedEventSchema = EventBaseSchema.extend({
  type: z.literal("run.completed"),
  status: RunStatusSchema,
  exitCode: z.number().int().optional(),
  durationMs: z.number().int().nonnegative().optional()
});

export const TraceEventSchema = z.discriminatedUnion("type", [
  RunStartedEventSchema,
  StepStartedEventSchema,
  OutputChunkEventSchema,
  ToolCalledEventSchema,
  ToolOutputEventSchema,
  BrowserActionEventSchema,
  McpMessageEventSchema,
  CheckpointRecordedEventSchema,
  StepFailedEventSchema,
  StepCompletedEventSchema,
  RunCompletedEventSchema
]);

export const ReplayAssertionSchema = z.object({
  checkpointId: z.string(),
  stepId: z.string().optional(),
  passed: z.boolean(),
  message: z.string().optional(),
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  artifactRefs: z.array(z.string()).default([])
});

export const ReplayReportSchema = z.object({
  runId: z.string(),
  replayedAt: z.string(),
  status: z.enum(["passed", "failed"]),
  divergenceStepId: z.string().optional(),
  assertions: z.array(ReplayAssertionSchema).default([]),
  capabilities: TraceCapabilitiesSchema.optional()
});

export const TraceManifestSchema = z.object({
  schemaVersion: z.string().default(TRACEFORGE_SCHEMA_VERSION),
  runId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: RunStatusSchema,
  metadata: RunMetadataSchema,
  capabilities: TraceCapabilitiesSchema.optional(),
  eventCount: z.number().int().nonnegative(),
  artifactCount: z.number().int().nonnegative(),
  artifacts: z.array(ArtifactRefSchema).default([]),
  redactionRules: z.array(RedactionRuleSchema).default([])
});

export const TraceBundleSchema = z.object({
  manifest: TraceManifestSchema,
  events: z.array(TraceEventSchema),
  replayReport: ReplayReportSchema.optional()
});

export type TraceSource = z.infer<typeof TraceSourceSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;
export type ErrorKind = z.infer<typeof ErrorKindSchema>;
export type CheckpointKind = z.infer<typeof CheckpointKindSchema>;
export type RedactionRule = z.infer<typeof RedactionRuleSchema>;
export type EnvironmentFingerprint = z.infer<typeof EnvironmentFingerprintSchema>;
export type ToolVersion = z.infer<typeof ToolVersionSchema>;
export type CapabilityStatus = z.infer<typeof CapabilityStatusSchema>;
export type CapabilityDescriptor = z.infer<typeof CapabilityDescriptorSchema>;
export type TraceCapabilities = CanonicalTraceCapabilities;
export type RunMetadata = z.infer<typeof RunMetadataSchema>;
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
export type StructuredError = z.infer<typeof StructuredErrorSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type TraceEvent = z.infer<typeof TraceEventSchema>;
export type ReplayAssertion = z.infer<typeof ReplayAssertionSchema>;
export type ReplayReport = z.infer<typeof ReplayReportSchema>;
export type TraceManifest = z.infer<typeof TraceManifestSchema>;
export type TraceBundle = z.infer<typeof TraceBundleSchema>;

export function nowIso(): string {
  return new Date().toISOString();
}

export function createEventId(prefix = "evt"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createRunId(prefix = "run"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createTraceCapabilities(source: TraceSource): TraceCapabilities {
  if (source === "terminal") {
    return {
      source,
      replay: capabilityDescriptor("supported"),
      exportTest: capabilityDescriptor("supported"),
      view: capabilityDescriptor("supported")
    };
  }

  if (source === "mcp") {
    return {
      source,
      replay: capabilityDescriptor(
        "unsupported",
        "Replay is not yet supported for MCP trace bundles."
      ),
      exportTest: capabilityDescriptor("supported"),
      view: capabilityDescriptor("supported")
    };
  }

  return {
    source,
    replay: capabilityDescriptor(
      "unsupported",
      "Replay is not yet supported for browser trace bundles."
    ),
    exportTest: capabilityDescriptor(
      "partial",
      "Generated browser tests are best-effort scaffolding based on captured URL and page metadata."
    ),
    view: capabilityDescriptor("supported")
  };
}

export function resolveTraceCapabilities(
  source: TraceSource,
  capabilities?: TraceCapabilities | undefined
): TraceCapabilities {
  return capabilities ?? createTraceCapabilities(source);
}

export function isTraceEvent(value: unknown): value is TraceEvent {
  return TraceEventSchema.safeParse(value).success;
}

export function parseTraceManifest(value: unknown): TraceManifest {
  return TraceManifestSchema.parse(value);
}

export function parseTraceEvent(value: unknown): TraceEvent {
  return TraceEventSchema.parse(value);
}

export function parseReplayReport(value: unknown): ReplayReport {
  return ReplayReportSchema.parse(value);
}

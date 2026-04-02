import {
  resolveTraceCapabilities,
  type TraceCapabilities,
  type TraceManifest
} from "@traceforge/schema";

export type ViewPayload = {
  bundleDir: string;
  traceApi: string;
  viewerMode: "existing" | "built-dist" | "spawned-dev";
  viewerUrl: string;
  opened: boolean;
  capabilities: TraceCapabilities;
};

export function buildViewPayload(input: {
  bundleDir: string;
  traceApi: string;
  viewerMode: ViewPayload["viewerMode"];
  viewerUrl: string;
  opened: boolean;
  manifest: TraceManifest;
}): ViewPayload {
  return {
    bundleDir: input.bundleDir,
    traceApi: input.traceApi,
    viewerMode: input.viewerMode,
    viewerUrl: input.viewerUrl,
    opened: input.opened,
    capabilities: resolveTraceCapabilities(
      input.manifest.metadata.source,
      input.manifest.capabilities
    )
  };
}

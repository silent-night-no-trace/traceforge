import {
  parseReplayReport,
  parseTraceEvent,
  parseTraceManifest,
  type ArtifactRef,
  type ReplayReport,
  type TraceEvent,
  type TraceManifest
} from "@traceforge/schema";

export type LoadedTraceBundle = {
  manifest: TraceManifest;
  events: TraceEvent[];
  artifactById: Record<string, ArtifactRef>;
  artifactUrlForId?: (artifactId: string) => string;
  replayReport?: ReplayReport;
  bundleDir?: string;
};

function parseNdjson(text: string): unknown[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function buildArtifactIndex(manifest: TraceManifest): Record<string, ArtifactRef> {
  return Object.fromEntries(manifest.artifacts.map((artifact) => [artifact.id, artifact]));
}

async function fetchTextOrThrow(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

async function fetchOptionalReplayReport(base: string): Promise<ReplayReport | undefined> {
  const response = await fetch(`${base}/api/replay-report`);

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch replay report: ${response.status}`);
  }

  return parseReplayReport(await response.json());
}

async function fetchOptionalBundleDir(base: string): Promise<string | undefined> {
  const response = await fetch(`${base}/health`);

  if (!response.ok) {
    return undefined;
  }

  const payload = (await response.json()) as { bundleDir?: string };
  return payload.bundleDir;
}

export async function loadTraceBundleFiles(
  manifestFile: File,
  eventsFile: File
): Promise<LoadedTraceBundle> {
  const [manifestText, eventsText] = await Promise.all([
    manifestFile.text(),
    eventsFile.text()
  ]);

  const manifest = parseTraceManifest(JSON.parse(manifestText));
  const events = parseNdjson(eventsText).map((value) => parseTraceEvent(value));

  return {
    manifest,
    events: [...events].sort((a, b) => a.ts.localeCompare(b.ts)),
    artifactById: buildArtifactIndex(manifest)
  };
}

export async function loadTraceBundleFromApi(traceApiBase: string): Promise<LoadedTraceBundle> {
  const base = traceApiBase.replace(/\/+$/, "");

  const [manifestText, eventsText, replayReport, bundleDir] = await Promise.all([
    fetchTextOrThrow(`${base}/api/manifest`),
    fetchTextOrThrow(`${base}/api/events`),
    fetchOptionalReplayReport(base),
    fetchOptionalBundleDir(base)
  ]);

  const manifest = parseTraceManifest(JSON.parse(manifestText));
  const events = parseNdjson(eventsText).map((value) => parseTraceEvent(value));

  return {
    manifest,
    events: [...events].sort((a, b) => a.ts.localeCompare(b.ts)),
    artifactById: buildArtifactIndex(manifest),
    artifactUrlForId: (artifactId: string) =>
      `${base}/api/artifacts/${encodeURIComponent(artifactId)}`,
    ...(bundleDir ? { bundleDir } : {}),
    ...(replayReport ? { replayReport } : {})
  };
}

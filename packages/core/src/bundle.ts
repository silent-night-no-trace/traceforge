import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  TraceEventSchema,
  TraceManifestSchema,
  type ArtifactKind,
  type ArtifactRef,
  type TraceEvent,
  type TraceManifest
} from "@traceforge/schema";

export type BundleWriter = {
  rootDir: string;
  writeManifest: (manifest: TraceManifest) => Promise<void>;
  appendEvent: (event: TraceEvent) => Promise<void>;
};

export type WriteArtifactInput = {
  fileName: string;
  kind: ArtifactKind;
  content: string | Buffer;
  mimeType?: string;
  description?: string;
};

export function getBundlePath(rootDir: string, fileName: string): string {
  return join(rootDir, fileName);
}

export async function ensureBundleDirectories(rootDir: string): Promise<void> {
  await mkdir(rootDir, { recursive: true });
  await mkdir(join(rootDir, "artifacts"), { recursive: true });
  await mkdir(join(rootDir, "attachments"), { recursive: true });
}

export async function writeManifest(rootDir: string, manifest: TraceManifest): Promise<void> {
  const parsed = TraceManifestSchema.parse(manifest);
  await writeFile(
    getBundlePath(rootDir, "manifest.json"),
    `${JSON.stringify(parsed, null, 2)}\n`,
    "utf8"
  );
}

export async function appendEvent(rootDir: string, event: TraceEvent): Promise<void> {
  const parsed = TraceEventSchema.parse(event);
  await appendFile(
    getBundlePath(rootDir, "events.ndjson"),
    `${JSON.stringify(parsed)}\n`,
    "utf8"
  );
}

export async function writeArtifact(
  rootDir: string,
  input: WriteArtifactInput
): Promise<ArtifactRef> {
  const buffer = Buffer.isBuffer(input.content)
    ? input.content
    : Buffer.from(input.content, "utf8");

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const id = `artifact_${sha256.slice(0, 16)}`;
  const relativePath = `artifacts/${input.fileName}`;

  await writeFile(getBundlePath(rootDir, relativePath), buffer);

  return {
    id,
    kind: input.kind,
    path: relativePath,
    sha256,
    mimeType: input.mimeType,
    size: buffer.byteLength,
    description: input.description
  };
}

export async function createBundleWriter(rootDir: string): Promise<BundleWriter> {
  await ensureBundleDirectories(rootDir);

  return {
    rootDir,
    writeManifest: (manifest) => writeManifest(rootDir, manifest),
    appendEvent: (event) => appendEvent(rootDir, event)
  };
}

export async function readManifest(rootDir: string): Promise<TraceManifest> {
  const raw = await readFile(getBundlePath(rootDir, "manifest.json"), "utf8");
  return TraceManifestSchema.parse(JSON.parse(raw));
}

export async function readEvents(rootDir: string): Promise<TraceEvent[]> {
  const raw = await readFile(getBundlePath(rootDir, "events.ndjson"), "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => TraceEventSchema.parse(JSON.parse(line)));
}

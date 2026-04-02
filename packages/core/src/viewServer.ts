import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parseReplayReport, parseTraceManifest, type ArtifactRef } from "@traceforge/schema";

export type TraceViewServer = {
  bundleDir: string;
  baseUrl: string;
  close: () => Promise<void>;
};

async function assertReadable(filePath: string): Promise<void> {
  await access(filePath, constants.R_OK);
}

async function isReadable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function validateBundleDir(bundleDir: string): Promise<void> {
  const manifestPath = join(bundleDir, "manifest.json");
  const eventsPath = join(bundleDir, "events.ndjson");

  await Promise.all([assertReadable(manifestPath), assertReadable(eventsPath)]);
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Cache-Control", "no-store");
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function sendText(response: ServerResponse, statusCode: number, text: string): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(text);
}

async function loadArtifactIndex(bundleDir: string): Promise<Map<string, ArtifactRef>> {
  const manifestRaw = await readFile(join(bundleDir, "manifest.json"), "utf8");
  const manifest = parseTraceManifest(JSON.parse(manifestRaw));

  return new Map(manifest.artifacts.map((artifact) => [artifact.id, artifact]));
}

function resolveArtifactPath(bundleDir: string, artifact: ArtifactRef): string {
  const absolutePath = resolve(bundleDir, artifact.path);
  const rel = relative(bundleDir, absolutePath);

  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Artifact path escapes bundle: ${artifact.path}`);
  }

  return absolutePath;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  bundleDir: string,
  artifactIndex: Map<string, ArtifactRef>
): Promise<void> {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (url.pathname === "/health") {
    sendJson(response, 200, { ok: true, bundleDir });
    return;
  }

  if (url.pathname === "/api/manifest") {
    const text = await readFile(join(bundleDir, "manifest.json"), "utf8");
    sendText(response, 200, text);
    return;
  }

  if (url.pathname === "/api/events") {
    const text = await readFile(join(bundleDir, "events.ndjson"), "utf8");
    sendText(response, 200, text);
    return;
  }

  if (url.pathname === "/api/replay-report") {
    const replayPath = join(bundleDir, "replay-report.json");

    if (!(await isReadable(replayPath))) {
      sendJson(response, 404, { error: "Replay report not found" });
      return;
    }

    const text = await readFile(replayPath, "utf8");
    const parsed = parseReplayReport(JSON.parse(text));
    sendJson(response, 200, parsed);
    return;
  }

  if (url.pathname.startsWith("/api/artifacts/")) {
    const artifactId = decodeURIComponent(url.pathname.replace("/api/artifacts/", ""));
    const artifact = artifactIndex.get(artifactId);

    if (!artifact) {
      sendJson(response, 404, { error: `Artifact not found: ${artifactId}` });
      return;
    }

    const artifactPath = resolveArtifactPath(bundleDir, artifact);
    const buffer = await readFile(artifactPath);

    response.statusCode = 200;
    response.setHeader(
      "Content-Type",
      artifact.mimeType ?? "application/octet-stream"
    );
    response.setHeader(
      "Content-Disposition",
      `inline; filename="${artifact.path.split("/").pop() ?? artifact.id}"`
    );
    response.end(buffer);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

export async function startTraceViewServer(inputBundleDir: string): Promise<TraceViewServer> {
  const bundleDir = resolve(inputBundleDir);
  await validateBundleDir(bundleDir);
  const artifactIndex = await loadArtifactIndex(bundleDir);

  const server = createServer((request, response) => {
    void handleRequest(request, response, bundleDir, artifactIndex).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unexpected server error";
      setCorsHeaders(response);
      sendJson(response, 500, { error: message });
    });
  });

  await new Promise<void>((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine local trace view server address.");
  }

  return {
    bundleDir,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => {
          if (error) {
            rejectPromise(error);
            return;
          }
          resolvePromise();
        });
      })
  };
}

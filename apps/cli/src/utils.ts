import { access, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";

export function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

export function parseJsonObjectOption(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object for MCP tool arguments.");
  }

  return parsed as Record<string, unknown>;
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const result = await stat(targetPath);
    return result.isDirectory();
  } catch {
    return false;
  }
}

export async function resolveBundleDirInput(inputPath: string): Promise<string> {
  const direct = resolve(process.cwd(), inputPath);

  if (await isDirectory(direct)) {
    return direct;
  }

  const directBaseName = normalize(inputPath).toLowerCase();
  if (directBaseName.endsWith("manifest.json") || directBaseName.endsWith("events.ndjson")) {
    const parent = dirname(direct);
    if (await isDirectory(parent)) {
      return parent;
    }
  }

  const traceDirCandidate = resolve(process.cwd(), ".traceforge", "traces", inputPath);
  if (await isDirectory(traceDirCandidate)) {
    return traceDirCandidate;
  }

  throw new Error(`Could not resolve a trace bundle directory from '${inputPath}'.`);
}

export function contentTypeForPath(filePath: string): string {
  const extension = extname(filePath).toLowerCase();

  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".map":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

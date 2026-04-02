import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectRepeatedOption,
  contentTypeForPath,
  parseJsonObjectOption,
  resolveBundleDirInput,
  trimTrailingSlash
} from "./utils";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cli utils", () => {
  it("collects repeatable options in order", () => {
    expect(collectRepeatedOption("b", collectRepeatedOption("a"))).toEqual(["a", "b"]);
  });

  it("parses JSON object options and rejects non-object values", () => {
    expect(parseJsonObjectOption('{"message":"hello"}')).toEqual({ message: "hello" });
    expect(() => parseJsonObjectOption("[]")).toThrow("Expected a JSON object");
  });

  it("normalizes trailing slashes and content types", () => {
    expect(trimTrailingSlash("http://127.0.0.1:5173///")).toBe("http://127.0.0.1:5173");
    expect(contentTypeForPath("viewer/index.html")).toBe("text/html; charset=utf-8");
    expect(contentTypeForPath("viewer/data.bin")).toBe("application/octet-stream");
  });

  it("resolves bundle directories from direct paths, manifest files, and trace ids", async () => {
    const cwd = join(tmpdir(), `traceforge-cli-${Date.now()}`);
    await mkdir(cwd, { recursive: true });
    const bundleDir = join(cwd, "bundle");
    const traceDir = join(cwd, ".traceforge", "traces", "run_abc123");

    await mkdir(bundleDir, { recursive: true });
    await mkdir(traceDir, { recursive: true });
    await writeFile(join(bundleDir, "manifest.json"), "{}", "utf8");

    const originalCwd = process.cwd();
    process.chdir(cwd);

    try {
      await expect(resolveBundleDirInput("bundle")).resolves.toBe(bundleDir);
      await expect(resolveBundleDirInput("bundle/manifest.json")).resolves.toBe(bundleDir);
      await expect(resolveBundleDirInput("run_abc123")).resolves.toBe(traceDir);
      await expect(resolveBundleDirInput("missing-run")).rejects.toThrow(
        "Could not resolve a trace bundle directory"
      );
    } finally {
      process.chdir(originalCwd);
    }
  });
});

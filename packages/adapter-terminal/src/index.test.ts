import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readEvents, readManifest } from "@traceforge/core";
import { captureTerminalRun } from "./index";

describe("captureTerminalRun", () => {
  it("captures a successful command", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "traceforge-terminal-"));

    const result = await captureTerminalRun({
      command: process.execPath,
      args: ["-e", "process.stdout.write('ok\\n')"],
      outputDir
    });

    expect(result.status).toBe("passed");
    expect(result.exitCode).toBe(0);

    const manifest = await readManifest(result.bundleDir);
    const events = await readEvents(result.bundleDir);

    expect(manifest.status).toBe("passed");
    expect(events.some((event) => event.type === "output.chunk")).toBe(true);
    expect(events.some((event) => event.type === "run.completed")).toBe(true);
  });

  it("captures a failing command", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "traceforge-terminal-"));

    const result = await captureTerminalRun({
      command: process.execPath,
      args: ["-e", "process.exit(2)"],
      outputDir
    });

    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(2);

    const events = await readEvents(result.bundleDir);
    expect(events.some((event) => event.type === "step.failed")).toBe(true);
  });
});

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createBundleWriter, writeArtifact } from "@traceforge/core";
import {
  createTraceCapabilities,
  createEventId,
  createRunId,
  nowIso,
  TRACEFORGE_SCHEMA_VERSION,
  type ArtifactRef,
  type TraceEvent,
  type TraceManifest
} from "@traceforge/schema";

export type CaptureBrowserOptions = {
  url: string;
  outputDir: string;
  waitMs?: number | undefined;
  headless?: boolean | undefined;
  viewport?: {
    width: number;
    height: number;
  } | undefined;
};

export type CaptureBrowserResult = {
  runId: string;
  bundleDir: string;
  status: "passed" | "failed";
  finalUrl: string;
  title: string;
  eventCount: number;
};

export async function captureBrowserRun(
  options: CaptureBrowserOptions
): Promise<CaptureBrowserResult> {
  const runId = createRunId();
  const startedAt = nowIso();
  const stepId = "step_browser_main";
  const bundleDir = join(options.outputDir, runId);

  await mkdir(bundleDir, { recursive: true });

  const writer = await createBundleWriter(bundleDir);
  let eventCount = 0;
  const artifacts: ArtifactRef[] = [];
  let consoleText = "";

  const manifest: TraceManifest = {
    schemaVersion: TRACEFORGE_SCHEMA_VERSION,
    runId,
    createdAt: startedAt,
    updatedAt: startedAt,
    status: "running",
    metadata: {
      title: `browser:${options.url}`,
      args: [options.url],
      source: "browser",
      startedAt,
      environment: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        shell: process.env.SHELL ?? process.env.ComSpec,
        cwd: process.cwd(),
        ci: Boolean(process.env.CI)
      },
      tools: [],
      tags: ["browser"]
    },
    capabilities: createTraceCapabilities("browser"),
    eventCount: 0,
    artifactCount: 0,
    artifacts: [],
    redactionRules: []
  };

  async function pushEvent(event: TraceEvent): Promise<void> {
    await writer.appendEvent(event);
    eventCount += 1;
  }

  await pushEvent({
    type: "run.started",
    eventId: createEventId(),
    runId,
    ts: startedAt,
    source: "browser",
    metadata: manifest.metadata
  });

  await pushEvent({
    type: "step.started",
    eventId: createEventId(),
    runId,
    ts: startedAt,
    source: "browser",
    stepId,
    title: `navigate to ${options.url}`
  });

  await writer.writeManifest({ ...manifest, eventCount });

  const browser = await chromium.launch({
    headless: options.headless ?? true
  });

  let finalUrl = options.url;
  let title = "";

  try {
    const context = await browser.newContext({
      viewport: options.viewport ?? { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    page.on("console", async (message) => {
      const text = `[${message.type()}] ${message.text()}`;
      consoleText += `${text}\n`;
      await pushEvent({
        type: "output.chunk",
        eventId: createEventId(),
        runId,
        ts: nowIso(),
        source: "browser",
        stepId,
        stream: "console",
        text
      });
    });

    await page.goto(options.url, { waitUntil: "networkidle" });

    if ((options.waitMs ?? 0) > 0) {
      await page.waitForTimeout(options.waitMs ?? 0);
    }

    finalUrl = page.url();
    title = await page.title();

    const screenshot = await page.screenshot({ fullPage: true, type: "png" });
    const html = await page.content();

    const screenshotArtifact = await writeArtifact(bundleDir, {
      fileName: "page.png",
      kind: "screenshot",
      content: screenshot,
      mimeType: "image/png",
      description: "Captured page screenshot"
    });
    artifacts.push(screenshotArtifact);

    const htmlArtifact = await writeArtifact(bundleDir, {
      fileName: "page.html",
      kind: "html",
      content: html,
      mimeType: "text/html; charset=utf-8",
      description: "Captured page HTML"
    });
    artifacts.push(htmlArtifact);

    const metadataArtifact = await writeArtifact(bundleDir, {
      fileName: "page-metadata.json",
      kind: "json",
      content: JSON.stringify(
        {
          finalUrl,
          title,
          viewport: options.viewport ?? { width: 1280, height: 800 },
          capturedAt: nowIso()
        },
        null,
        2
      ),
      mimeType: "application/json; charset=utf-8",
      description: "Captured browser page metadata"
    });
    artifacts.push(metadataArtifact);

    if (consoleText) {
      const consoleArtifact = await writeArtifact(bundleDir, {
        fileName: "console.txt",
        kind: "text",
        content: consoleText,
        mimeType: "text/plain; charset=utf-8",
        description: "Captured browser console output"
      });
      artifacts.push(consoleArtifact);
    }

    await pushEvent({
      type: "browser.action",
      eventId: createEventId(),
      runId,
      ts: nowIso(),
      source: "browser",
      stepId,
      action: "navigate",
      url: finalUrl,
      artifactRefs: artifacts.map((artifact) => artifact.id)
    });

    const finishedAt = nowIso();

    await pushEvent({
      type: "step.completed",
      eventId: createEventId(),
      runId,
      ts: finishedAt,
      source: "browser",
      stepId,
      status: "passed"
    });

    await pushEvent({
      type: "run.completed",
      eventId: createEventId(),
      runId,
      ts: finishedAt,
      source: "browser",
      status: "passed"
    });

    await writer.writeManifest({
      ...manifest,
      updatedAt: finishedAt,
      status: "passed",
      eventCount,
      artifactCount: artifacts.length,
      artifacts
    });

    await context.close();

    return {
      runId,
      bundleDir,
      status: "passed",
      finalUrl,
      title,
      eventCount
    };
  } catch (error) {
    const finishedAt = nowIso();

    await pushEvent({
      type: "step.failed",
      eventId: createEventId(),
      runId,
      ts: finishedAt,
      source: "browser",
      stepId,
      error: {
        kind: "runtime",
        message: error instanceof Error ? error.message : String(error),
        details: error
      },
      artifactRefs: artifacts.map((artifact) => artifact.id)
    });

    await pushEvent({
      type: "run.completed",
      eventId: createEventId(),
      runId,
      ts: finishedAt,
      source: "browser",
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

    throw error;
  } finally {
    await browser.close();
  }
}

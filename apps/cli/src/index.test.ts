import { afterEach, describe, expect, it, vi } from "vitest";

const {
  mockResolveBundleDirInput,
  mockResolveViewerSession,
  mockOpenUrl,
  mockReadManifest,
  mockStartTraceViewServer,
  mockReplayBundle
} = vi.hoisted(() => ({
  mockResolveBundleDirInput: vi.fn(),
  mockResolveViewerSession: vi.fn(),
  mockOpenUrl: vi.fn(),
  mockReadManifest: vi.fn(),
  mockStartTraceViewServer: vi.fn(),
  mockReplayBundle: vi.fn()
}));

vi.mock("./utils", async () => {
  const actual = await vi.importActual<typeof import("./utils")>("./utils");
  return {
    ...actual,
    resolveBundleDirInput: mockResolveBundleDirInput
  };
});

vi.mock("./viewSupport", () => ({
  resolveViewerSession: mockResolveViewerSession,
  openUrl: mockOpenUrl
}));

vi.mock("@traceforge/core", () => ({
  readManifest: mockReadManifest,
  replayBundle: mockReplayBundle,
  startTraceViewServer: mockStartTraceViewServer
}));

import { createTraceCapabilities, type TraceManifest } from "@traceforge/schema";
import { createCli } from "./index";

function manifestFor(source: "terminal" | "mcp" | "browser" = "terminal"): TraceManifest {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    schemaVersion: "0.1.0",
    runId: `run_${source}`,
    createdAt: now,
    updatedAt: now,
    status: "passed",
    metadata: {
      title: source,
      args: [],
      source,
      startedAt: now,
      environment: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        cwd: process.cwd(),
        ci: false
      },
      tools: [],
      tags: []
    },
    capabilities: createTraceCapabilities(source),
    eventCount: 0,
    artifactCount: 0,
    artifacts: [],
    redactionRules: []
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  mockResolveBundleDirInput.mockReset();
  mockResolveViewerSession.mockReset();
  mockOpenUrl.mockReset();
  mockReadManifest.mockReset();
  mockStartTraceViewServer.mockReset();
  mockReplayBundle.mockReset();
});

describe("createCli", () => {
  it("registers the expected top-level commands", () => {
    const commandNames = createCli().commands.map((command) => command.name());

    expect(commandNames).toEqual([
      "capture",
      "capture-mcp",
      "capture-browser",
      "list-mcp-tools",
      "view",
      "replay",
      "export-test"
    ]);
  });

  it("emits machine-readable payloads for the view command without opening a browser", async () => {
    mockResolveBundleDirInput.mockResolvedValue("C:/bundles/run_123");
    mockStartTraceViewServer.mockResolvedValue({
      baseUrl: "http://127.0.0.1:9001",
      close: vi.fn().mockResolvedValue(undefined)
    });
    mockReadManifest.mockResolvedValue(manifestFor("browser"));
    mockResolveViewerSession.mockResolvedValue({
      viewerUrl: "http://127.0.0.1:4173/",
      mode: "existing",
      close: vi.fn().mockResolvedValue(undefined)
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "once").mockImplementation(((..._args: unknown[]) => process) as typeof process.once);

    await createCli().parseAsync(["node", "traceforge", "view", "run_123", "--json", "--no-open"]);

    expect(mockResolveBundleDirInput).toHaveBeenCalledWith("run_123");
    expect(mockStartTraceViewServer).toHaveBeenCalledWith("C:/bundles/run_123");
    expect(mockOpenUrl).not.toHaveBeenCalled();

    const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as {
      bundleDir: string;
      traceApi: string;
      viewerUrl: string;
      opened: boolean;
      capabilities: { replay: { status: string }; exportTest: { status: string } };
    };

    expect(payload.bundleDir).toBe("C:/bundles/run_123");
    expect(payload.traceApi).toBe("http://127.0.0.1:9001");
    expect(payload.viewerUrl).toBe(
      "http://127.0.0.1:4173/?traceApi=http%3A%2F%2F127.0.0.1%3A9001"
    );
    expect(payload.opened).toBe(false);
    expect(payload.capabilities.replay.status).toBe("unsupported");
    expect(payload.capabilities.exportTest.status).toBe("partial");
  });
});

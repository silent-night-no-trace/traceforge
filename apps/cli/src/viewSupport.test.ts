import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveViewerSession,
  startSpawnedViewerSession,
  startStaticViewerServer,
  waitForHttp
} from "./viewSupport";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("viewSupport", () => {
  it("waits until a URL responds with a non-5xx status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    vi.stubGlobal("fetch", fetchMock);

    await expect(waitForHttp("http://127.0.0.1:5173", 1000)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("serves static viewer files, falls back to index.html, and blocks path traversal", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "traceforge-static-viewer-"));
    await writeFile(join(rootDir, "index.html"), "<html><body>viewer</body></html>", "utf8");
    await writeFile(join(rootDir, "app.js"), "console.log('viewer');", "utf8");

    const server = await startStaticViewerServer(rootDir);

    try {
      const [index, jsAsset, fallback] = await Promise.all([
        fetch(`${server.baseUrl}/`),
        fetch(`${server.baseUrl}/app.js`),
        fetch(`${server.baseUrl}/missing-route`)
      ]);

      expect(index.status).toBe(200);
      await expect(index.text()).resolves.toContain("viewer");

      expect(jsAsset.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
      await expect(jsAsset.text()).resolves.toContain("console.log");

      expect(fallback.status).toBe(200);
      await expect(fallback.text()).resolves.toContain("viewer");
    } finally {
      await server.close();
    }
  });

  it("prefers an existing viewer when the URL is already reachable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const session = await resolveViewerSession({
      viewerUrl: "http://127.0.0.1:4173",
      open: false
    });

    expect(session.mode).toBe("existing");
    expect(session.viewerUrl).toBe("http://127.0.0.1:4173");
    await session.close();
  });

  it("falls back to built viewer dist when the requested viewer is unreachable", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "traceforge-viewer-session-"));
    const distDir = join(cwd, "apps", "viewer", "dist");
    await mkdir(distDir, { recursive: true });
    await writeFile(join(distDir, "index.html"), "<html><body>dist viewer</body></html>", "utf8");

    const originalCwd = process.cwd();
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockRejectedValue(new Error("viewer down"));
    vi.stubGlobal("fetch", fetchMock);
    process.chdir(cwd);

    try {
      const session = await resolveViewerSession({
        viewerUrl: "http://127.0.0.1:5999",
        open: false
      });

      expect(session.mode).toBe("built-dist");
      vi.stubGlobal("fetch", originalFetch);
      const response = await fetch(`${session.viewerUrl}/`);
      await expect(response.text()).resolves.toContain("dist viewer");
      await session.close();
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("kills a spawned viewer process if readiness fails", async () => {
    class FakeViewerProcess extends EventEmitter {
      killed = false;
      exitCode: number | null = null;
      killCalls = 0;

      kill(): boolean {
        this.killCalls += 1;
        this.killed = true;
        this.exitCode = 1;
        this.emit("exit", 1, null);
        this.emit("close", 1, null);
        return true;
      }
    }

    const viewerProcess = new FakeViewerProcess();
    const spawnViewer = vi.fn(() => viewerProcess);
    const waitForReady = vi.fn(async () => {
      throw new Error("viewer failed to boot");
    });

    await expect(
      startSpawnedViewerSession("http://127.0.0.1:5999", {
        spawnViewer,
        waitForReady
      })
    ).rejects.toThrow("viewer failed to boot");

    expect(spawnViewer).toHaveBeenCalledOnce();
    expect(waitForReady).toHaveBeenCalledWith("http://127.0.0.1:5999");
    expect(viewerProcess.killed).toBe(true);
    expect(viewerProcess.killCalls).toBe(1);
  });

  it("closes a spawned viewer session cleanly after readiness succeeds", async () => {
    class FakeViewerProcess extends EventEmitter {
      killed = false;
      exitCode: number | null = null;
      killCalls = 0;

      kill(): boolean {
        this.killCalls += 1;
        this.killed = true;
        this.exitCode = 0;
        this.emit("close", 0, null);
        this.emit("exit", 0, null);
        return true;
      }
    }

    const viewerProcess = new FakeViewerProcess();
    const session = await startSpawnedViewerSession("http://127.0.0.1:5999", {
      spawnViewer: vi.fn(() => viewerProcess),
      waitForReady: vi.fn(async () => undefined)
    });

    expect(viewerProcess.killed).toBe(false);
    expect(session.mode).toBe("spawned-dev");

    await session.close();

    expect(viewerProcess.killed).toBe(true);
    expect(viewerProcess.killCalls).toBe(1);
  });
});

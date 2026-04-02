import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, relative, resolve } from "node:path";
import { contentTypeForPath, pathExists } from "./utils";

export type ViewOptions = {
  viewerUrl: string;
  spawnViewer?: boolean;
  open: boolean;
  printUrl?: boolean;
  json?: boolean;
};

type StartedServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

type ViewerProcessHandle = {
  kill: () => boolean;
  killed: boolean;
  exitCode: number | null;
  once: (event: "exit" | "close", listener: (...args: unknown[]) => void) => unknown;
};

export type ViewerMode = "existing" | "built-dist" | "spawned-dev";

export type ViewerSession = {
  viewerUrl: string;
  close: () => Promise<void>;
  mode: ViewerMode;
};

async function stopViewerProcess(viewerProcess?: ViewerProcessHandle): Promise<void> {
  if (!viewerProcess || viewerProcess.killed || viewerProcess.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolvePromise) => {
    let finished = false;
    const finish = () => {
      if (!finished) {
        finished = true;
        resolvePromise();
      }
    };

    viewerProcess.once("exit", finish);
    viewerProcess.once("close", finish);

    const terminated = viewerProcess.kill();
    if (!terminated) {
      finish();
      return;
    }

    setTimeout(finish, 500);
  });
}

export async function waitForHttp(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // retry
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 400));
  }

  throw new Error(`Viewer did not become ready in time: ${url}`);
}

export async function openUrl(targetUrl: string): Promise<void> {
  const command =
    process.platform === "win32"
      ? "cmd"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";

  const args = process.platform === "win32" ? ["/c", "start", "", targetUrl] : [targetUrl];

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      detached: process.platform !== "win32"
    });

    child.once("error", rejectPromise);
    child.once("spawn", () => {
      child.unref();
      resolvePromise();
    });
  });
}

export async function startStaticViewerServer(rootDir: string): Promise<StartedServer> {
  const server = createServer((request, response) => {
    void (async () => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const relativePath = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
      const safePath = resolve(rootDir, relativePath);
      const rel = relative(rootDir, safePath);

      if (rel.startsWith("..")) {
        response.statusCode = 403;
        response.end("Forbidden");
        return;
      }

      let filePath = safePath;

      if (!(await pathExists(filePath))) {
        filePath = join(rootDir, "index.html");
      }

      const content = await readFile(filePath);
      response.statusCode = 200;
      response.setHeader("Content-Type", contentTypeForPath(filePath));
      response.end(content);
    })().catch((error: unknown) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : "Viewer server error");
    });
  });

  await new Promise<void>((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine static viewer server address.");
  }

  return {
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

export async function startSpawnedViewerSession(
  viewerUrl: string,
  dependencies: {
    spawnViewer?: (viewerUrl: string) => ViewerProcessHandle;
    waitForReady?: (viewerUrl: string) => Promise<void>;
  } = {}
): Promise<ViewerSession> {
  const spawnViewer = dependencies.spawnViewer ?? spawnViewerDevServer;
  const waitForReady = dependencies.waitForReady ?? ((url: string) => waitForHttp(url));
  const viewerProcess = spawnViewer(viewerUrl);

  try {
    await waitForReady(viewerUrl);
  } catch (error) {
    await stopViewerProcess(viewerProcess);
    throw error;
  }

  return {
    viewerUrl,
    mode: "spawned-dev",
    close: () => stopViewerProcess(viewerProcess)
  };
}

export async function resolveViewerSession(options: ViewOptions): Promise<ViewerSession> {
  let staticViewerServer: StartedServer | undefined;

  const close = async (): Promise<void> => {
    if (staticViewerServer) {
      await staticViewerServer.close();
    }
  };

  if (options.spawnViewer) {
    return startSpawnedViewerSession(options.viewerUrl);
  }

  try {
    await waitForHttp(options.viewerUrl, 1_500);
    return {
      viewerUrl: options.viewerUrl,
      close,
      mode: "existing"
    };
  } catch {
    // try built viewer next
  }

  const builtViewerDir = resolve(process.cwd(), "apps", "viewer", "dist");
  if (await pathExists(join(builtViewerDir, "index.html"))) {
    staticViewerServer = await startStaticViewerServer(builtViewerDir);
    return {
      viewerUrl: staticViewerServer.baseUrl,
      close,
      mode: "built-dist"
    };
  }

  return startSpawnedViewerSession(options.viewerUrl);
}

export function spawnViewerDevServer(viewerUrl: string): ChildProcess {
  const url = new URL(viewerUrl);
  const host = url.hostname;
  const port = url.port || "5173";
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

  return spawn(command, ["--filter", "@traceforge/viewer", "dev", "--", "--host", host, "--port", port], {
    stdio: "inherit",
    shell: false
  });
}

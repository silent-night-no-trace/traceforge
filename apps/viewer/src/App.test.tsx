// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadedTraceBundle } from "./loadTraceBundle";

const { mockLoadTraceBundleFromApi, mockLoadTraceBundleFiles } = vi.hoisted(() => ({
  mockLoadTraceBundleFromApi: vi.fn(),
  mockLoadTraceBundleFiles: vi.fn()
}));

vi.mock("./loadTraceBundle", () => ({
  loadTraceBundleFromApi: mockLoadTraceBundleFromApi,
  loadTraceBundleFiles: mockLoadTraceBundleFiles
}));

import { App } from "./App";

function buildLoadedTrace(): LoadedTraceBundle {
  return {
    manifest: {
      schemaVersion: "0.1.0",
      runId: "run_app",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "failed",
      metadata: {
        title: "App integration trace",
        args: [],
        source: "terminal",
        startedAt: "2026-01-01T00:00:00.000Z",
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
      eventCount: 3,
      artifactCount: 1,
      artifacts: [
        {
          id: "artifact_stdout",
          kind: "stdout",
          path: "artifacts/stdout.txt",
          sha256: "abc123",
          mimeType: "text/plain; charset=utf-8"
        }
      ],
      redactionRules: []
    },
    events: [
      {
        type: "step.started",
        eventId: "evt_step_started",
        runId: "run_app",
        ts: "2026-01-01T00:00:01.000Z",
        source: "terminal",
        stepId: "step_compile",
        title: "Compile prompt"
      },
      {
        type: "output.chunk",
        eventId: "evt_output_stdout",
        runId: "run_app",
        ts: "2026-01-01T00:00:01.500Z",
        source: "terminal",
        stepId: "step_compile",
        stream: "stdout",
        text: "compile output line\n",
        artifactRef: "artifact_stdout"
      },
      {
        type: "step.completed",
        eventId: "evt_step_completed",
        runId: "run_app",
        ts: "2026-01-01T00:00:02.000Z",
        source: "terminal",
        stepId: "step_compile",
        status: "failed"
      }
    ],
    artifactById: {
      artifact_stdout: {
        id: "artifact_stdout",
        kind: "stdout",
        path: "artifacts/stdout.txt",
        sha256: "abc123",
        mimeType: "text/plain; charset=utf-8"
      }
    },
    replayReport: {
      runId: "run_app",
      replayedAt: "2026-01-01T00:00:03.000Z",
      status: "failed",
      assertions: [
        {
          checkpointId: "checkpoint_compile",
          stepId: "step_compile",
          passed: false,
          message: "Compile output diverged",
          artifactRefs: []
        },
        {
          checkpointId: "checkpoint_stdout_text",
          stepId: "step_compile",
          passed: false,
          message: "stdout changed",
          artifactRefs: ["artifact_stdout"],
          expected: "expected stdout",
          actual: "actual stdout"
        }
      ]
    }
  };
}

beforeEach(() => {
  window.history.replaceState({}, "", "/?traceApi=http://127.0.0.1:9001");
  mockLoadTraceBundleFromApi.mockResolvedValue(buildLoadedTrace());
  mockLoadTraceBundleFiles.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
  mockLoadTraceBundleFromApi.mockReset();
  mockLoadTraceBundleFiles.mockReset();
});

describe("App", () => {
  it("auto-loads from traceApi and links replay assertions back to the timeline", async () => {
    const { container } = render(<App />);

    expect(mockLoadTraceBundleFromApi).toHaveBeenCalledWith("http://127.0.0.1:9001");

    await screen.findByText(/Current load mode: trace API: http:\/\/127\.0\.0\.1:9001/i);
    expect(screen.getByText("run_app")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Replay assertions" })).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Go to step" })[0]!);

    await waitFor(() => {
      expect(screen.getAllByText("Linked to selected step").length).toBeGreaterThan(0);
      expect(container.querySelector(".step-group-focused")).not.toBeNull();
      expect(container.querySelector(".timeline-item-focused")).not.toBeNull();
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  it("links timeline items back to assertions and can focus the related output block", async () => {
    const { container } = render(<App />);

    await screen.findByRole("heading", { name: "Replay assertions" });

    fireEvent.click((await screen.findAllByRole("button", { name: /step: step_compile/i }))[0]!);

    await waitFor(() => {
      expect(screen.getAllByText("Linked to selected step").length).toBeGreaterThan(0);
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Go to output" })[0]!);

    await waitFor(() => {
      expect(container.querySelector(".output-block-stream-focused")).not.toBeNull();
      expect(container.querySelector(".output-block-focused")).not.toBeNull();
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });
});

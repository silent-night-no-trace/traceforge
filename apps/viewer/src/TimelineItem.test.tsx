// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LoadedTraceBundle } from "./loadTraceBundle";
import { TimelineItem } from "./TimelineItem";

function createTrace(): LoadedTraceBundle {
  return {
    manifest: {
      schemaVersion: "0.1.0",
      runId: "run_viewer",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "passed",
      metadata: {
        title: "Viewer trace",
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
      eventCount: 1,
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
    events: [],
    artifactById: {
      artifact_stdout: {
        id: "artifact_stdout",
        kind: "stdout",
        path: "artifacts/stdout.txt",
        sha256: "abc123",
        mimeType: "text/plain; charset=utf-8"
      }
    }
  };
}

describe("TimelineItem", () => {
  it("renders event details, toggles artifact previews, and forwards step focus", () => {
    const onFocusAssertions = vi.fn();

    render(
      <TimelineItem
        event={{
          type: "tool.output",
          eventId: "evt_tool_output",
          runId: "run_viewer",
          ts: "2026-01-01T00:00:01.000Z",
          source: "terminal",
          stepId: "step_1",
          toolName: "echo",
          output: { message: "done" },
          isError: false,
          artifactRefs: ["artifact_stdout"]
        }}
        trace={createTrace()}
        relatedArtifactIds={["artifact_stdout"]}
        highlighted={false}
        onFocusAssertions={onFocusAssertions}
      />
    );

    expect(screen.getByRole("heading", { name: /tool output: echo/i })).toBeTruthy();
    expect(screen.queryByText(/no tool output/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /step: step_1/i }));
    expect(onFocusAssertions).toHaveBeenCalledWith("step_1");

    fireEvent.click(screen.getByRole("button", { name: /show related artifacts/i }));
    expect(screen.getByText(/artifact preview requires loading the trace through/i)).toBeTruthy();
  });
});

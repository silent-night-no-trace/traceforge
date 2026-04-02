import { describe, expect, it } from "vitest";
import type { TraceEvent } from "@traceforge/schema";
import { buildRenderableTimelineItems } from "./renderableTimeline";

function event(overrides: Partial<TraceEvent> & Pick<TraceEvent, "type" | "eventId" | "runId" | "ts" | "source">): TraceEvent {
  if (overrides.type === "output.chunk") {
    const { type, eventId, runId, ts, source, ...rest } = overrides;
    return {
      type,
      eventId,
      runId,
      ts,
      source,
      stream: "stdout",
      text: "",
      ...rest
    };
  }

  const { type, eventId, runId, ts, source, ...rest } = overrides;
  return {
    type,
    eventId,
    runId,
    ts,
    source,
    status: "passed",
    ...rest
  } as TraceEvent;
}

describe("buildRenderableTimelineItems", () => {
  it("merges consecutive output chunks from the same stream and step", () => {
    const items = buildRenderableTimelineItems([
      event({
        type: "output.chunk",
        eventId: "evt_1",
        runId: "run_1",
        ts: "2026-01-01T00:00:00.000Z",
        source: "terminal",
        stepId: "step_1",
        stream: "stdout",
        text: "hello\n",
        artifactRef: "artifact_a"
      }),
      event({
        type: "output.chunk",
        eventId: "evt_2",
        runId: "run_1",
        ts: "2026-01-01T00:00:01.000Z",
        source: "terminal",
        stepId: "step_1",
        stream: "stdout",
        text: "world\n",
        artifactRef: "artifact_b"
      }),
      event({
        type: "step.completed",
        eventId: "evt_3",
        runId: "run_1",
        ts: "2026-01-01T00:00:02.000Z",
        source: "terminal",
        stepId: "step_1",
        status: "passed"
      })
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]?.kind).toBe("output-block");
    if (items[0]?.kind !== "output-block") {
      throw new Error("Expected first item to be output block");
    }

    expect(items[0].chunkCount).toBe(2);
    expect(items[0].fullText).toBe("hello\nworld\n");
    expect(items[0].lineCount).toBe(3);
    expect(items[0].artifactIds).toEqual(["artifact_a", "artifact_b"]);
    expect(items[1]?.kind).toBe("event");
  });

  it("starts a new block when source, stream, or step changes", () => {
    const items = buildRenderableTimelineItems([
      event({
        type: "output.chunk",
        eventId: "evt_1",
        runId: "run_1",
        ts: "2026-01-01T00:00:00.000Z",
        source: "terminal",
        stepId: "step_1",
        stream: "stdout",
        text: "first"
      }),
      event({
        type: "output.chunk",
        eventId: "evt_2",
        runId: "run_1",
        ts: "2026-01-01T00:00:01.000Z",
        source: "terminal",
        stepId: "step_1",
        stream: "stderr",
        text: "second"
      }),
      event({
        type: "output.chunk",
        eventId: "evt_3",
        runId: "run_1",
        ts: "2026-01-01T00:00:02.000Z",
        source: "mcp",
        stepId: "step_1",
        stream: "stderr",
        text: "third"
      })
    ]);

    expect(items).toHaveLength(3);
    expect(items.every((item) => item.kind === "output-block")).toBe(true);
  });
});

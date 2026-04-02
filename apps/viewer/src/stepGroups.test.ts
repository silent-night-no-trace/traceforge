import { describe, expect, it } from "vitest";
import type { ReplayAssertion, TraceEvent } from "@traceforge/schema";
import { groupEventsByStep, sortStepGroups } from "./stepGroups";

function createStepEvent(
  type: TraceEvent["type"],
  overrides: Partial<TraceEvent> & Pick<TraceEvent, "eventId" | "runId" | "ts" | "source">
): TraceEvent {
  if (type === "step.started") {
    const { eventId, runId, ts, source, ...rest } = overrides;
    return {
      type,
      eventId,
      runId,
      ts,
      source,
      title: "Test step",
      ...rest
    } as TraceEvent;
  }

  if (type === "checkpoint.recorded") {
    const { eventId, runId, ts, source, ...rest } = overrides;
    return {
      type,
      eventId,
      runId,
      ts,
      source,
      checkpoint: {
        id: "checkpoint_1",
        kind: "text-match",
        label: "stdout",
        passed: false,
        artifactRefs: ["artifact_checkpoint"]
      },
      ...rest
    } as TraceEvent;
  }

  const { eventId, runId, ts, source, ...rest } = overrides;
  return {
    type: "step.completed",
    eventId,
    runId,
    ts,
    source,
    status: "passed",
    ...rest
  } as TraceEvent;
}

describe("step grouping", () => {
  it("groups step events, preserves titles, and marks failed assertions", () => {
    const events: TraceEvent[] = [
      createStepEvent("step.completed", {
        eventId: "evt_3",
        runId: "run_1",
        ts: "2026-01-01T00:00:03.000Z",
        source: "terminal",
        stepId: "step_1"
      }),
      createStepEvent("step.started", {
        eventId: "evt_1",
        runId: "run_1",
        ts: "2026-01-01T00:00:01.000Z",
        source: "terminal",
        stepId: "step_1",
        title: "Compile"
      }),
      {
        type: "output.chunk",
        eventId: "evt_2",
        runId: "run_1",
        ts: "2026-01-01T00:00:02.000Z",
        source: "terminal",
        stepId: "step_1",
        stream: "stdout",
        text: "hello",
        artifactRef: "artifact_stdout"
      },
      {
        type: "run.started",
        eventId: "evt_0",
        runId: "run_1",
        ts: "2026-01-01T00:00:00.000Z",
        source: "terminal",
        metadata: {
          source: "terminal",
          startedAt: "2026-01-01T00:00:00.000Z",
          environment: {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            cwd: process.cwd(),
            ci: false
          },
          args: [],
          tools: [],
          tags: []
        }
      }
    ];
    const assertions: ReplayAssertion[] = [
      {
        checkpointId: "checkpoint_stdout_text",
        stepId: "step_1",
        passed: false,
        artifactRefs: ["artifact_stdout"]
      }
    ];

    const groups = groupEventsByStep(events, assertions);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.stepId).toBeUndefined();
    expect(groups[1]?.title).toBe("Compile");
    expect(groups[1]?.status).toBe("failed");
    expect(groups[1]?.artifactIds).toEqual(["artifact_stdout"]);
    expect(groups[1]?.failedAssertionCount).toBe(1);
  });

  it("sorts failures first and filters non-failures when requested", () => {
    const groups = groupEventsByStep(
      [
        createStepEvent("step.started", {
          eventId: "evt_warn_start",
          runId: "run_1",
          ts: "2026-01-01T00:00:01.000Z",
          source: "mcp",
          stepId: "step_warn"
        }),
        createStepEvent("checkpoint.recorded", {
          eventId: "evt_warn_checkpoint",
          runId: "run_1",
          ts: "2026-01-01T00:00:02.000Z",
          source: "mcp",
          stepId: "step_warn"
        }),
        createStepEvent("step.started", {
          eventId: "evt_pass_start",
          runId: "run_1",
          ts: "2026-01-01T00:00:03.000Z",
          source: "mcp",
          stepId: "step_pass"
        }),
        createStepEvent("step.completed", {
          eventId: "evt_pass_done",
          runId: "run_1",
          ts: "2026-01-01T00:00:04.000Z",
          source: "mcp",
          stepId: "step_pass",
          status: "passed"
        })
      ],
      [
        {
          checkpointId: "checkpoint_warn",
          stepId: "step_warn",
          passed: false,
          artifactRefs: []
        }
      ]
    );

    const sorted = sortStepGroups(groups, {
      failuresFirst: true,
      onlyFailures: true
    });

    expect(sorted).toHaveLength(1);
    expect(sorted[0]?.stepId).toBe("step_warn");
    expect(sorted[0]?.status).toBe("failed");
  });
});

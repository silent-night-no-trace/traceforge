import type { ReplayAssertion, TraceEvent, TraceSource } from "@traceforge/schema";

export type StepGroupStatus = "failed" | "warning" | "passed" | "running";

export type StepGroup = {
  key: string;
  stepId?: string;
  title: string;
  source: TraceSource | "mixed";
  status: StepGroupStatus;
  startedAt: string;
  endedAt: string;
  events: TraceEvent[];
  eventCount: number;
  artifactIds: string[];
  failedAssertionCount: number;
};

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function artifactIdsForEvent(event: TraceEvent): string[] {
  switch (event.type) {
    case "output.chunk":
      return event.artifactRef ? [event.artifactRef] : [];
    case "tool.output":
    case "browser.action":
    case "step.failed":
      return event.artifactRefs;
    case "checkpoint.recorded":
      return event.checkpoint.artifactRefs;
    default:
      return [];
  }
}

function titleForGroup(stepId: string | undefined, events: TraceEvent[]): string {
  const stepStarted = events.find((event) => event.type === "step.started");
  if (stepStarted?.type === "step.started") {
    return stepStarted.title;
  }

  if (stepId) {
    return stepId;
  }

  return events[0]?.type ?? "event-group";
}

function sourceForGroup(events: TraceEvent[]): TraceSource | "mixed" {
  const sources = unique(events.map((event) => event.source));
  return sources.length === 1 && sources[0] ? sources[0] : "mixed";
}

function statusForGroup(events: TraceEvent[], failedAssertionCount: number): StepGroupStatus {
  if (failedAssertionCount > 0 || events.some((event) => event.type === "step.failed")) {
    return "failed";
  }

  if (
    events.some(
      (event) => event.type === "checkpoint.recorded" && event.checkpoint.passed === false
    )
  ) {
    return "warning";
  }

  const completed = [...events].reverse().find((event) => event.type === "step.completed");
  if (completed?.type === "step.completed") {
    return completed.status === "passed" ? "passed" : "warning";
  }

  return "running";
}

export function groupEventsByStep(events: TraceEvent[], assertions: ReplayAssertion[] = []): StepGroup[] {
  const byStep = new Map<string, TraceEvent[]>();
  const ungrouped: TraceEvent[] = [];

  for (const event of events) {
    if (!event.stepId) {
      ungrouped.push(event);
      continue;
    }

    const list = byStep.get(event.stepId) ?? [];
    list.push(event);
    byStep.set(event.stepId, list);
  }

  const failedAssertionCountByStep = assertions.reduce<Record<string, number>>((acc, assertion) => {
    if (assertion.stepId && !assertion.passed) {
      acc[assertion.stepId] = (acc[assertion.stepId] ?? 0) + 1;
    }
    return acc;
  }, {});

  const groups: StepGroup[] = [...byStep.entries()].map(([stepId, groupEvents]) => {
    const sortedEvents = [...groupEvents].sort((a, b) => a.ts.localeCompare(b.ts));
    const failedAssertionCount = failedAssertionCountByStep[stepId] ?? 0;

    return {
      key: stepId,
      stepId,
      title: titleForGroup(stepId, sortedEvents),
      source: sourceForGroup(sortedEvents),
      status: statusForGroup(sortedEvents, failedAssertionCount),
      startedAt: sortedEvents[0]!.ts,
      endedAt: sortedEvents[sortedEvents.length - 1]!.ts,
      events: sortedEvents,
      eventCount: sortedEvents.length,
      artifactIds: unique(sortedEvents.flatMap(artifactIdsForEvent)),
      failedAssertionCount
    };
  });

  if (ungrouped.length > 0) {
    const sortedUngrouped = [...ungrouped].sort((a, b) => a.ts.localeCompare(b.ts));
    groups.push({
      key: "ungrouped",
      title: "Ungrouped events",
      source: sourceForGroup(sortedUngrouped),
      status: "running",
      startedAt: sortedUngrouped[0]!.ts,
      endedAt: sortedUngrouped[sortedUngrouped.length - 1]!.ts,
      events: sortedUngrouped,
      eventCount: sortedUngrouped.length,
      artifactIds: unique(sortedUngrouped.flatMap(artifactIdsForEvent)),
      failedAssertionCount: 0
    });
  }

  return groups.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function sortStepGroups(
  groups: StepGroup[],
  options: {
    failuresFirst: boolean;
    onlyFailures: boolean;
  }
): StepGroup[] {
  let next = [...groups];

  if (options.onlyFailures) {
    next = next.filter((group) => group.status === "failed" || group.failedAssertionCount > 0);
  }

  if (!options.failuresFirst) {
    return next;
  }

  const rank = (group: StepGroup): number => {
    if (group.status === "failed") return 0;
    if (group.status === "warning") return 1;
    if (group.status === "running") return 2;
    return 3;
  };

  return next.sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    return a.startedAt.localeCompare(b.startedAt);
  });
}

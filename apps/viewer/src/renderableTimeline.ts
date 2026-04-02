import type { TraceEvent, TraceSource } from "@traceforge/schema";

type OutputChunkEvent = Extract<TraceEvent, { type: "output.chunk" }>;

export type OutputBlockItem = {
  kind: "output-block";
  key: string;
  stepId?: string | undefined;
  source: TraceSource;
  stream: OutputChunkEvent["stream"];
  startedAt: string;
  endedAt: string;
  chunkCount: number;
  charCount: number;
  lineCount: number;
  preview: string;
  fullText: string;
  artifactIds: string[];
};

export type EventItem = {
  kind: "event";
  key: string;
  event: TraceEvent;
};

export type RenderableTimelineItem = EventItem | OutputBlockItem;

function isOutputChunkEvent(event: TraceEvent): event is OutputChunkEvent {
  return event.type === "output.chunk";
}

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function previewText(text: string, maxChars = 180): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) {
    return compact || "(empty output)";
  }

  return `${compact.slice(0, maxChars)}...`;
}

function countLines(text: string): number {
  if (!text) {
    return 0;
  }

  return text.split("\n").length;
}

export function buildRenderableTimelineItems(events: TraceEvent[]): RenderableTimelineItem[] {
  const items: RenderableTimelineItem[] = [];
  let currentBlock: OutputBlockItem | null = null;

  function flushBlock(): void {
    if (!currentBlock) {
      return;
    }

    items.push(currentBlock);
    currentBlock = null;
  }

  for (const event of events) {
    if (!isOutputChunkEvent(event)) {
      flushBlock();
      items.push({
        kind: "event",
        key: event.eventId,
        event
      });
      continue;
    }

    const chunkArtifactIds = event.artifactRef ? [event.artifactRef] : [];

    if (
      currentBlock &&
      currentBlock.stream === event.stream &&
      currentBlock.stepId === event.stepId &&
      currentBlock.source === event.source
    ) {
      currentBlock.endedAt = event.ts;
      currentBlock.chunkCount += 1;
      currentBlock.charCount += event.text.length;
      currentBlock.fullText += event.text;
      currentBlock.preview = previewText(currentBlock.fullText);
      currentBlock.lineCount = countLines(currentBlock.fullText);
      currentBlock.artifactIds = unique([...currentBlock.artifactIds, ...chunkArtifactIds]);
      continue;
    }

    flushBlock();

    currentBlock = {
      kind: "output-block",
      key: `output_${event.eventId}`,
      stepId: event.stepId,
      source: event.source,
      stream: event.stream,
      startedAt: event.ts,
      endedAt: event.ts,
      chunkCount: 1,
      charCount: event.text.length,
      lineCount: countLines(event.text),
      preview: previewText(event.text),
      fullText: event.text,
      artifactIds: chunkArtifactIds
    };
  }

  flushBlock();

  return items;
}

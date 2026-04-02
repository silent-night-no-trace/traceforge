import { useEffect, useState } from "react";
import type { TraceEvent } from "@traceforge/schema";
import { ArtifactPreview } from "./ArtifactPreview";
import { eventTone, formatEventDetail, formatEventTitle } from "./eventFormatters";
import type { LoadedTraceBundle } from "./loadTraceBundle";

export function TimelineItem({
  event,
  trace,
  relatedArtifactIds,
  highlighted,
  registerAnchor,
  onFocusAssertions
}: {
  event: TraceEvent;
  trace: LoadedTraceBundle;
  relatedArtifactIds: string[];
  highlighted: boolean;
  registerAnchor?: ((node: HTMLElement | null) => void) | undefined;
  onFocusAssertions?: ((stepId: string) => void) | undefined;
}) {
  const detail = formatEventDetail(event);
  const stepId = event.stepId;
  const defaultExpanded = event.type === "step.failed" && relatedArtifactIds.length > 0;
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (highlighted && relatedArtifactIds.length > 0) {
      setExpanded(true);
    }
  }, [highlighted, relatedArtifactIds.length]);

  return (
    <article
      ref={registerAnchor}
      className={`timeline-item tone-${eventTone(event)} ${highlighted ? "timeline-item-focused" : ""}`}
    >
      <div className="timeline-topline">
        <span className="event-type">{event.type}</span>
        <span className="event-ts">{new Date(event.ts).toLocaleString()}</span>
      </div>

      <h3 className="event-title">{formatEventTitle(event)}</h3>

      <div className="event-meta">
        <span>source: {event.source}</span>
        {stepId ? (
          <button
            type="button"
            className={`step-link-button ${highlighted ? "step-link-button-active" : ""}`}
            onClick={(evt) => {
              evt.stopPropagation();
              onFocusAssertions?.(stepId);
            }}
          >
            step: {stepId}
          </button>
        ) : null}
        <span>id: {event.eventId}</span>
      </div>

      {detail ? <pre className="event-detail">{detail}</pre> : null}

      {relatedArtifactIds.length > 0 ? (
        <div className="event-artifacts">
          <div className="artifact-chip-row">
            <button className="artifact-toggle-button" type="button" onClick={() => setExpanded((value) => !value)}>
              {expanded ? "Hide" : "Show"} related artifacts ({relatedArtifactIds.length})
            </button>

            {relatedArtifactIds.map((artifactId) => (
              <span key={artifactId} className="artifact-chip">
                {artifactId}
              </span>
            ))}
          </div>

          {expanded ? (
            <div className="event-artifact-grid">
              {relatedArtifactIds.map((artifactId) => (
                <ArtifactPreview key={artifactId} artifactId={artifactId} trace={trace} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

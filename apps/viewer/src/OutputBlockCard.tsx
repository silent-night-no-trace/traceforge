import { useEffect, useMemo, useState } from "react";
import { ArtifactPreview } from "./ArtifactPreview";
import { relatedArtifactIdsForOutputBlock } from "./eventFormatters";
import type { LoadedTraceBundle } from "./loadTraceBundle";
import type { OutputBlockItem } from "./renderableTimeline";

export function OutputBlockCard({
  block,
  trace,
  highlighted,
  streamFocused,
  registerAnchor
}: {
  block: OutputBlockItem;
  trace: LoadedTraceBundle;
  highlighted: boolean;
  streamFocused: boolean;
  registerAnchor?: ((node: HTMLElement | null) => void) | undefined;
}) {
  const [open, setOpen] = useState(streamFocused || (highlighted && block.chunkCount > 1));

  useEffect(() => {
    if (streamFocused) {
      setOpen(true);
    }
  }, [streamFocused]);

  const relatedArtifactIds = useMemo(() => relatedArtifactIdsForOutputBlock(block, trace), [block, trace]);

  return (
    <details
      ref={registerAnchor}
      className={`output-block-card ${highlighted ? "output-block-focused" : ""} ${
        streamFocused ? "output-block-stream-focused" : ""
      }`}
      open={open}
      onToggle={(event) => {
        setOpen((event.currentTarget as HTMLDetailsElement).open);
      }}
    >
      <summary className="output-block-summary">
        <div className="output-block-left">
          <span className={`output-stream-badge stream-${block.stream}`}>{block.stream}</span>
          <div className="output-block-heading">
            <strong>{block.preview}</strong>
            <span>
              {block.chunkCount} chunks · {block.charCount} chars · {block.lineCount} lines
            </span>
          </div>
        </div>

        <div className="output-block-right">
          <span>{new Date(block.startedAt).toLocaleTimeString()}</span>
        </div>
      </summary>

      <div className="output-block-body">
        <pre className="output-block-pre">{block.fullText || "(empty output)"}</pre>

        {relatedArtifactIds.length > 0 ? (
          <section className="output-block-artifacts">
            <div className="output-block-artifact-header">
              <span className="diff-stat-label">Related artifacts</span>
              <span>{relatedArtifactIds.length} linked</span>
            </div>

            <div className="artifact-chip-row">
              {relatedArtifactIds.map((artifactId) => (
                <span key={artifactId} className="artifact-chip">
                  {artifactId}
                </span>
              ))}
            </div>

            <div className="event-artifact-grid">
              {relatedArtifactIds.map((artifactId) => (
                <ArtifactPreview key={artifactId} artifactId={artifactId} trace={trace} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </details>
  );
}

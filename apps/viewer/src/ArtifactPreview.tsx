import { useEffect, useMemo, useState } from "react";
import type { LoadedTraceBundle } from "./loadTraceBundle";

const MAX_TEXT_PREVIEW_CHARS = 3000;

function isTextLike(mimeType: string | undefined, kind: string): boolean {
  if (!mimeType) {
    return kind === "stdout" || kind === "stderr" || kind === "text" || kind === "json";
  }

  return mimeType.startsWith("text/") || mimeType.includes("json");
}

type ArtifactPreviewProps = {
  artifactId: string;
  trace: LoadedTraceBundle;
};

export function ArtifactPreview({ artifactId, trace }: ArtifactPreviewProps) {
  const artifact = trace.artifactById[artifactId];
  const href = useMemo(
    () => (artifact && trace.artifactUrlForId ? trace.artifactUrlForId(artifact.id) : undefined),
    [artifact, trace]
  );

  const [textPreview, setTextPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!artifact || !href || !isTextLike(artifact.mimeType, artifact.kind)) {
      setTextPreview(null);
      return;
    }

    let cancelled = false;

    void fetch(href)
      .then((response) => response.text())
      .then((text) => {
        if (!cancelled) {
          setTextPreview(text.slice(0, MAX_TEXT_PREVIEW_CHARS));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTextPreview("Preview unavailable.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [artifact, href]);

  if (!artifact) {
    return null;
  }

  const isImage = artifact.mimeType?.startsWith("image/") || artifact.kind === "screenshot";

  return (
    <article className="artifact-card">
      <div className="artifact-header">
        <strong>{artifact.description ?? artifact.kind}</strong>
        <span>{artifact.path}</span>
      </div>

      <div className="artifact-meta">
        <span>id: {artifact.id}</span>
        <span>kind: {artifact.kind}</span>
        {artifact.size ? <span>size: {artifact.size} bytes</span> : null}
      </div>

      {href ? (
        <p className="artifact-link-row">
          <a href={href} target="_blank" rel="noreferrer">
            Open artifact
          </a>
        </p>
      ) : (
        <p className="artifact-link-row muted">
          Artifact preview requires loading the trace through `traceforge view`.
        </p>
      )}

      {isImage && href ? (
        <img className="artifact-preview-image" src={href} alt={artifact.description ?? artifact.id} />
      ) : null}

      {!isImage && textPreview ? (
        <pre className="artifact-preview-text">{textPreview}</pre>
      ) : null}
    </article>
  );
}

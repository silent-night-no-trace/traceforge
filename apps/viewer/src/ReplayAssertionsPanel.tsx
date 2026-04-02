import type { ReplayAssertion } from "@traceforge/schema";
import { ArtifactPreview } from "./ArtifactPreview";
import type { LoadedTraceBundle } from "./loadTraceBundle";

type DiffSummaryLike = {
  normalizedLength?: unknown;
  sha256?: unknown;
  preview?: unknown;
  firstDifferenceIndex?: unknown;
  line?: unknown;
  column?: unknown;
  contextAtDifference?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDiffSummaryLike(value: unknown): value is DiffSummaryLike {
  if (!isRecord(value)) {
    return false;
  }

  return (
    "preview" in value ||
    "sha256" in value ||
    "firstDifferenceIndex" in value ||
    "contextAtDifference" in value
  );
}

function formatValue(value: unknown): string {
  if (value === undefined) {
    return "(none)";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function valueAsText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null || value === undefined) {
    return "(none)";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function assertionTone(assertion: ReplayAssertion): "success" | "danger" {
  return assertion.passed ? "success" : "danger";
}

function renderMetaValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (value === null || value === undefined) {
    return "(none)";
  }

  return JSON.stringify(value);
}

function outputStreamForAssertion(assertion: ReplayAssertion): "stdout" | "stderr" | null {
  if (assertion.checkpointId === "checkpoint_stdout_text") {
    return "stdout";
  }

  if (assertion.checkpointId === "checkpoint_stderr_text") {
    return "stderr";
  }

  return null;
}

function DiffSummaryPanel({
  label,
  value
}: {
  label: "Expected" | "Actual";
  value: DiffSummaryLike;
}) {
  return (
    <section className="diff-summary-card">
      <div className="diff-summary-header">
        <span className="assertion-value-label">{label}</span>
        <div className="diff-meta-row">
          {"line" in value && value.line !== null && value.line !== undefined ? (
            <span className="diff-meta-chip">line {renderMetaValue(value.line)}</span>
          ) : null}
          {"column" in value && value.column !== null && value.column !== undefined ? (
            <span className="diff-meta-chip">col {renderMetaValue(value.column)}</span>
          ) : null}
          {"firstDifferenceIndex" in value &&
          value.firstDifferenceIndex !== null &&
          value.firstDifferenceIndex !== undefined ? (
            <span className="diff-meta-chip">idx {renderMetaValue(value.firstDifferenceIndex)}</span>
          ) : null}
        </div>
      </div>

      <div className="diff-stat-grid">
        {"normalizedLength" in value ? (
          <div className="diff-stat">
            <span className="diff-stat-label">Length</span>
            <strong>{renderMetaValue(value.normalizedLength)}</strong>
          </div>
        ) : null}

        {"sha256" in value ? (
          <div className="diff-stat">
            <span className="diff-stat-label">SHA-256</span>
            <code>{renderMetaValue(value.sha256)}</code>
          </div>
        ) : null}
      </div>

      {"preview" in value ? (
        <div className="diff-block">
          <span className="diff-block-label">Preview</span>
          <pre>{valueAsText(value.preview)}</pre>
        </div>
      ) : null}

      {"contextAtDifference" in value ? (
        <div className="diff-block">
          <span className="diff-block-label">Context at difference</span>
          <pre>{valueAsText(value.contextAtDifference)}</pre>
        </div>
      ) : null}
    </section>
  );
}

function GenericValuePanel({
  label,
  value
}: {
  label: "Expected" | "Actual";
  value: unknown;
}) {
  return (
    <section className="assertion-value-block">
      <span className="assertion-value-label">{label}</span>
      <pre>{formatValue(value)}</pre>
    </section>
  );
}

function AssertionValues({ assertion }: { assertion: ReplayAssertion }) {
  const hasExpected = assertion.expected !== undefined;
  const hasActual = assertion.actual !== undefined;

  if (!hasExpected && !hasActual) {
    return null;
  }

  const expectedIsDiff = isDiffSummaryLike(assertion.expected);
  const actualIsDiff = isDiffSummaryLike(assertion.actual);

  if (expectedIsDiff || actualIsDiff) {
    return (
      <div className="assertion-diff-grid">
        {expectedIsDiff ? (
          <DiffSummaryPanel label="Expected" value={assertion.expected as DiffSummaryLike} />
        ) : (
          <GenericValuePanel label="Expected" value={assertion.expected} />
        )}

        {actualIsDiff ? (
          <DiffSummaryPanel label="Actual" value={assertion.actual as DiffSummaryLike} />
        ) : (
          <GenericValuePanel label="Actual" value={assertion.actual} />
        )}
      </div>
    );
  }

  return (
    <div className="assertion-diff-grid">
      <GenericValuePanel label="Expected" value={assertion.expected} />
      <GenericValuePanel label="Actual" value={assertion.actual} />
    </div>
  );
}

function isTextReplayAssertion(assertion: ReplayAssertion): boolean {
  return (
    assertion.checkpointId === "checkpoint_stdout_text" ||
    assertion.checkpointId === "checkpoint_stderr_text"
  );
}

function TextReplayDiffCard({ assertion }: { assertion: ReplayAssertion }) {
  const expected = isDiffSummaryLike(assertion.expected) ? assertion.expected : undefined;
  const actual = isDiffSummaryLike(assertion.actual) ? assertion.actual : undefined;

  if (!expected || !actual) {
    return <AssertionValues assertion={assertion} />;
  }

  return (
    <div className="replay-diff-card">
      <div className="replay-diff-header">
        <strong>{assertion.checkpointId}</strong>
        <span>{assertion.message ?? "No diff message."}</span>
      </div>

      <div className="replay-diff-meta">
        {expected.line !== undefined && expected.line !== null ? (
          <span className="diff-meta-chip">line {renderMetaValue(expected.line)}</span>
        ) : null}
        {expected.column !== undefined && expected.column !== null ? (
          <span className="diff-meta-chip">col {renderMetaValue(expected.column)}</span>
        ) : null}
        {expected.firstDifferenceIndex !== undefined && expected.firstDifferenceIndex !== null ? (
          <span className="diff-meta-chip">idx {renderMetaValue(expected.firstDifferenceIndex)}</span>
        ) : null}
      </div>

      <div className="replay-diff-columns">
        <div className="replay-diff-column">
          <span className="assertion-value-label">Expected context</span>
          <pre>{valueAsText(expected.contextAtDifference ?? expected.preview)}</pre>
        </div>

        <div className="replay-diff-column">
          <span className="assertion-value-label">Actual context</span>
          <pre>{valueAsText(actual.contextAtDifference ?? actual.preview)}</pre>
        </div>
      </div>

      <div className="replay-diff-stats">
        <div className="diff-stat">
          <span className="diff-stat-label">Expected length</span>
          <strong>{renderMetaValue(expected.normalizedLength)}</strong>
        </div>
        <div className="diff-stat">
          <span className="diff-stat-label">Actual length</span>
          <strong>{renderMetaValue(actual.normalizedLength)}</strong>
        </div>
        <div className="diff-stat">
          <span className="diff-stat-label">Expected hash</span>
          <code>{renderMetaValue(expected.sha256)}</code>
        </div>
        <div className="diff-stat">
          <span className="diff-stat-label">Actual hash</span>
          <code>{renderMetaValue(actual.sha256)}</code>
        </div>
      </div>
    </div>
  );
}

function AssertionCard({
  assertion,
  trace,
  focusedStepId,
  onFocusStep,
  onFocusOutput,
  registerAnchor
}: {
  assertion: ReplayAssertion;
  trace: LoadedTraceBundle;
  focusedStepId?: string | null | undefined;
  onFocusStep?: ((stepId: string) => void) | undefined;
  onFocusOutput?: ((stepId: string, stream: "stdout" | "stderr") => void) | undefined;
  registerAnchor?: ((node: HTMLElement | null) => void) | undefined;
}) {
  const hasArtifacts = assertion.artifactRefs.length > 0;
  const isFocused = focusedStepId !== null && assertion.stepId === focusedStepId;
  const outputStream = outputStreamForAssertion(assertion);

  return (
    <details
      ref={registerAnchor}
      className={`assertion-card tone-${assertionTone(assertion)} ${
        isFocused ? "assertion-card-focused" : ""
      }`}
      open={!assertion.passed || isFocused}
    >
      <summary className="assertion-summary">
        <div className="assertion-summary-left">
          <span className={`assertion-badge badge-${assertionTone(assertion)}`}>
            {assertion.passed ? "PASS" : "FAIL"}
          </span>
          <div className="assertion-heading">
            <strong>{assertion.checkpointId}</strong>
            <span>{assertion.message ?? "No assertion message."}</span>
          </div>
        </div>

        <div className="assertion-summary-right">
          {isFocused ? (
            <span className="focused-step-pill">Linked to selected step</span>
          ) : null}

          {assertion.stepId && outputStream ? (
            <button
              type="button"
              className="focus-output-button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onFocusOutput?.(assertion.stepId!, outputStream);
              }}
            >
              Go to output
            </button>
          ) : null}

          {assertion.stepId ? (
            <button
              type="button"
              className="focus-step-button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onFocusStep?.(assertion.stepId!);
              }}
            >
              Go to step
            </button>
          ) : null}

          {hasArtifacts ? (
            <span>
              {assertion.artifactRefs.length} artifact{assertion.artifactRefs.length > 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
      </summary>

      <div className="assertion-body">
        {assertion.stepId ? (
          <div className="assertion-step-link">
            <span className="diff-stat-label">Linked step</span>
            <code>{assertion.stepId}</code>
          </div>
        ) : null}

        {isTextReplayAssertion(assertion) ? (
          <TextReplayDiffCard assertion={assertion} />
        ) : (
          <AssertionValues assertion={assertion} />
        )}

        {hasArtifacts ? (
          <div className="assertion-artifacts">
            <div className="artifact-chip-row">
              {assertion.artifactRefs.map((artifactId) => (
                <span key={artifactId} className="artifact-chip">
                  {artifactId}
                </span>
              ))}
            </div>

            <div className="event-artifact-grid">
              {assertion.artifactRefs.map((artifactId) => (
                <ArtifactPreview key={artifactId} artifactId={artifactId} trace={trace} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function ReplayAssertionsPanel({
  trace,
  focusedStepId,
  onFocusStep,
  onFocusOutput,
  registerAssertionAnchor
}: {
  trace: LoadedTraceBundle;
  focusedStepId?: string | null | undefined;
  onFocusStep?: ((stepId: string) => void) | undefined;
  onFocusOutput?: ((stepId: string, stream: "stdout" | "stderr") => void) | undefined;
  registerAssertionAnchor?: ((stepId: string, node: HTMLElement | null) => void) | undefined;
}) {
  const replayReport = trace.replayReport;

  if (!replayReport || replayReport.assertions.length === 0) {
    return null;
  }

  const failedCount = replayReport.assertions.filter((assertion) => !assertion.passed).length;

  const firstAssertionKeyByStep = new Map<string, string>();
  for (const assertion of replayReport.assertions) {
    if (assertion.stepId && !firstAssertionKeyByStep.has(assertion.stepId)) {
      firstAssertionKeyByStep.set(assertion.stepId, assertion.checkpointId);
    }
  }

  const sortedAssertions = [...replayReport.assertions].sort((a, b) => {
    if (a.passed !== b.passed) {
      return a.passed ? 1 : -1;
    }

    if (focusedStepId && a.stepId === focusedStepId && b.stepId !== focusedStepId) {
      return -1;
    }

    if (focusedStepId && b.stepId === focusedStepId && a.stepId !== focusedStepId) {
      return 1;
    }

    return a.checkpointId.localeCompare(b.checkpointId);
  });

  return (
    <section className="panel">
      <div className="timeline-header">
        <h2>Replay assertions</h2>
        <span>
          {failedCount > 0
            ? `${failedCount} failed / ${replayReport.assertions.length} total`
            : `${replayReport.assertions.length} passing assertions`}
        </span>
      </div>

      <div className="chip-row">
        <span className="chip">failed: {failedCount}</span>
        <span className="chip">passed: {replayReport.assertions.filter((assertion) => assertion.passed).length}</span>
      </div>

      <div className="assertion-list">
        {sortedAssertions.map((assertion) => {
          const shouldRegister =
            assertion.stepId && firstAssertionKeyByStep.get(assertion.stepId) === assertion.checkpointId;

          return (
            <AssertionCard
              key={assertion.checkpointId}
              assertion={assertion}
              trace={trace}
              focusedStepId={focusedStepId}
              onFocusStep={onFocusStep}
              onFocusOutput={onFocusOutput}
              registerAnchor={
                shouldRegister && assertion.stepId
                  ? (node) => registerAssertionAnchor?.(assertion.stepId!, node)
                  : undefined
              }
            />
          );
        })}
      </div>
    </section>
  );
}

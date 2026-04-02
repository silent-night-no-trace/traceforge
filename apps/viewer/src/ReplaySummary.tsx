import type { LoadedTraceBundle } from "./loadTraceBundle";

export function ReplaySummary({ trace }: { trace: LoadedTraceBundle }) {
  if (!trace.replayReport) {
    return null;
  }

  return (
    <section className="panel">
      <div className="timeline-header">
        <h2>Replay report</h2>
        <span>{trace.replayReport.status}</span>
      </div>

      <div className="summary replay-summary">
        <div className="summary-card">
          <span className="summary-label">Replayed at</span>
          <strong>{new Date(trace.replayReport.replayedAt).toLocaleString()}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Status</span>
          <strong>{trace.replayReport.status}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Assertions</span>
          <strong>{trace.replayReport.assertions.length}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Divergence step</span>
          <strong>{trace.replayReport.divergenceStepId ?? "(none)"}</strong>
        </div>
      </div>
    </section>
  );
}

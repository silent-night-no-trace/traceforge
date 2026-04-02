import type { TraceCapabilities } from "@traceforge/schema";
import { capabilityRows } from "./eventFormatters";

export function CapabilityPanel({ capabilities }: { capabilities: TraceCapabilities }) {
  return (
    <section className="panel">
      <div className="timeline-header">
        <h2>Capabilities</h2>
        <span>Source-agnostic bundle contract</span>
      </div>

      <div className="summary capability-grid">
        {capabilityRows(capabilities).map((row) => (
          <div key={row.label} className={`summary-card capability-card capability-${row.tone}`}>
            <span className="summary-label">{row.label}</span>
            <strong>{row.value}</strong>
            {row.reason ? <span className="capability-reason">{row.reason}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

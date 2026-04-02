import { useEffect, useMemo, useRef, useState } from "react";
import { resolveTraceCapabilities } from "@traceforge/schema";
import { ArtifactPreview } from "./ArtifactPreview";
import { CapabilityPanel } from "./CapabilityPanel";
import {
  buildStepArtifactIndex,
  type FocusedOutputTarget,
  relatedArtifactIdsForEvent,
  type SourceFilter
} from "./eventFormatters";
import { loadTraceBundleFiles, loadTraceBundleFromApi, type LoadedTraceBundle } from "./loadTraceBundle";
import { OutputBlockCard } from "./OutputBlockCard";
import { ReplaySummary } from "./ReplaySummary";
import { ReplayAssertionsPanel } from "./ReplayAssertionsPanel";
import {
  buildRenderableTimelineItems,
  type RenderableTimelineItem
} from "./renderableTimeline";
import { groupEventsByStep, sortStepGroups } from "./stepGroups";
import { TimelineItem } from "./TimelineItem";
import "./app.css";

export function App() {
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [eventsFile, setEventsFile] = useState<File | null>(null);
  const [trace, setTrace] = useState<LoadedTraceBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");
  const [loadSourceLabel, setLoadSourceLabel] = useState<string>("manual files");
  const [focusedStepId, setFocusedStepId] = useState<string | null>(null);
  const [focusedOutputTarget, setFocusedOutputTarget] = useState<FocusedOutputTarget | null>(null);
  const [showFailuresFirst, setShowFailuresFirst] = useState(true);
  const [onlyFailures, setOnlyFailures] = useState(false);
  const [expandedStepIds, setExpandedStepIds] = useState<Record<string, boolean>>({});

  const stepAnchorMapRef = useRef<Record<string, HTMLElement | null>>({});
  const assertionAnchorMapRef = useRef<Record<string, HTMLElement | null>>({});
  const outputBlockAnchorMapRef = useRef<Record<string, HTMLElement | null>>({});
  const highlightTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const traceApi = new URLSearchParams(window.location.search).get("traceApi");
    if (!traceApi) {
      return;
    }

    setLoading(true);
    setError(null);
    setLoadSourceLabel(`trace API: ${traceApi}`);

    void loadTraceBundleFromApi(traceApi)
      .then((loaded) => {
        setTrace(loaded);
      })
      .catch((loadError: unknown) => {
        const message = loadError instanceof Error ? loadError.message : "Failed to auto-load trace bundle.";
        setError(message);
        setTrace(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    stepAnchorMapRef.current = {};
    assertionAnchorMapRef.current = {};
    outputBlockAnchorMapRef.current = {};
  }, [trace]);

  const stepArtifactIndex = useMemo(() => (trace ? buildStepArtifactIndex(trace.events) : {}), [trace]);

  const firstEventIdByStep = useMemo(() => {
    const index: Record<string, string> = {};

    if (!trace) {
      return index;
    }

    for (const event of trace.events) {
      if (event.stepId && !index[event.stepId]) {
        index[event.stepId] = event.eventId;
      }
    }

    return index;
  }, [trace]);

  const stepGroups = useMemo(() => {
    if (!trace) {
      return [];
    }

    return groupEventsByStep(trace.events, trace.replayReport?.assertions ?? []);
  }, [trace]);

  const visibleStepGroups = useMemo(() => {
    const base = sortStepGroups(stepGroups, {
      failuresFirst: showFailuresFirst,
      onlyFailures
    });

    return base.filter((group) => {
      if (sourceFilter !== "all" && group.source !== "mixed" && group.source !== sourceFilter) {
        return false;
      }

      if (!search.trim()) {
        return true;
      }

      const haystack = JSON.stringify(group).toLowerCase();
      return haystack.includes(search.trim().toLowerCase());
    });
  }, [stepGroups, showFailuresFirst, onlyFailures, sourceFilter, search]);

  const eventTypeCounts = useMemo(() => {
    if (!trace) {
      return {};
    }

    return trace.events.reduce<Record<string, number>>((acc, event) => {
      acc[event.type] = (acc[event.type] ?? 0) + 1;
      return acc;
    }, {});
  }, [trace]);

  const capabilities = useMemo(() => {
    if (!trace) {
      return null;
    }

    return resolveTraceCapabilities(trace.manifest.metadata.source, trace.manifest.capabilities);
  }, [trace]);

  function outputTargetKey(stepId: string, stream: string): string {
    return `${stepId}:${stream}`;
  }

  function applyFocusedTarget(stepId: string, stream?: FocusedOutputTarget["stream"]): void {
    setFocusedStepId(stepId);
    setFocusedOutputTarget(stream ? { stepId, stream } : null);

    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }

    highlightTimeoutRef.current = window.setTimeout(() => {
      setFocusedStepId((current) => (current === stepId ? null : current));
      setFocusedOutputTarget((current) => {
        if (!current) {
          return null;
        }

        if (current.stepId !== stepId) {
          return current;
        }

        if (stream && current.stream !== stream) {
          return current;
        }

        return null;
      });
    }, 2400);
  }

  function scrollToAnchor(node: HTMLElement | null | undefined): void {
    node?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  function focusStep(stepId: string, target: "timeline" | "assertion"): void {
    setSourceFilter("all");
    setSearch("");
    setExpandedStepIds((current) => ({
      ...current,
      [stepId]: true
    }));

    applyFocusedTarget(stepId);

    window.setTimeout(() => {
      if (target === "timeline") {
        scrollToAnchor(stepAnchorMapRef.current[stepId]);
      } else {
        scrollToAnchor(assertionAnchorMapRef.current[stepId]);
      }
    }, 0);
  }

  function focusOutputBlock(stepId: string, stream: FocusedOutputTarget["stream"]): void {
    setSourceFilter("all");
    setSearch("");
    setExpandedStepIds((current) => ({
      ...current,
      [stepId]: true
    }));

    applyFocusedTarget(stepId, stream);

    window.setTimeout(() => {
      const outputKey = outputTargetKey(stepId, stream);
      scrollToAnchor(outputBlockAnchorMapRef.current[outputKey] ?? stepAnchorMapRef.current[stepId]);
    }, 0);
  }

  function focusStepInTimeline(stepId: string): void {
    focusStep(stepId, "timeline");
  }

  function focusStepInAssertions(stepId: string): void {
    focusStep(stepId, "assertion");
  }

  async function handleLoad(): Promise<void> {
    if (!manifestFile || !eventsFile) {
      setError("Please select both manifest.json and events.ndjson.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const loaded = await loadTraceBundleFiles(manifestFile, eventsFile);
      setTrace(loaded);
      setLoadSourceLabel("manual files");
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load trace bundle.";
      setError(message);
      setTrace(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Traceforge Viewer</p>
        <h1>Open a trace bundle and inspect what really happened.</h1>
        <p className="hero-copy">
          This viewer can auto-load a trace from a local bridge API or load <code>manifest.json</code>
          and <code>events.ndjson</code> manually. When loaded via <code>traceforge view</code>, artifact
          previews and replay summaries are also available.
        </p>
      </header>

      <section className="panel controls">
        <div className="control-grid">
          <label className="field">
            <span>manifest.json</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => setManifestFile(event.target.files?.[0] ?? null)}
            />
          </label>

          <label className="field">
            <span>events.ndjson</span>
            <input
              type="file"
              accept=".ndjson,.jsonl,text/plain,application/x-ndjson"
              onChange={(event) => setEventsFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div className="button-row">
          <button className="primary-button" onClick={() => void handleLoad()} disabled={loading}>
            {loading ? "Loading..." : "Load trace"}
          </button>
        </div>

        <p className="helper-text">Current load mode: {loadSourceLabel}</p>
        {trace?.bundleDir ? <p className="helper-text">Bundle directory: {trace.bundleDir}</p> : null}

        {error ? <p className="error-text">{error}</p> : null}
      </section>

      {trace ? (
        <>
          <section className="panel summary">
            <div className="summary-card">
              <span className="summary-label">Run ID</span>
              <strong>{trace.manifest.runId}</strong>
            </div>
            <div className="summary-card">
              <span className="summary-label">Status</span>
              <strong>{trace.manifest.status}</strong>
            </div>
            <div className="summary-card">
              <span className="summary-label">Source</span>
              <strong>{trace.manifest.metadata.source}</strong>
            </div>
            <div className="summary-card">
              <span className="summary-label">Events</span>
              <strong>{trace.events.length}</strong>
            </div>
            <div className="summary-card">
              <span className="summary-label">Artifacts</span>
              <strong>{trace.manifest.artifactCount}</strong>
            </div>
          </section>

          {capabilities ? <CapabilityPanel capabilities={capabilities} /> : null}

          <ReplaySummary trace={trace} />
          <ReplayAssertionsPanel
            trace={trace}
            focusedStepId={focusedStepId}
            onFocusStep={focusStepInTimeline}
            onFocusOutput={focusOutputBlock}
            registerAssertionAnchor={(stepId, node) => {
              assertionAnchorMapRef.current[stepId] = node;
            }}
          />

          <section className="panel metadata">
            <h2>Run metadata</h2>
            <div className="metadata-grid">
              <div>
                <span className="meta-label">Command</span>
                <code>{trace.manifest.metadata.command ?? "(none)"}</code>
              </div>
              <div>
                <span className="meta-label">Started</span>
                <span>{new Date(trace.manifest.metadata.startedAt).toLocaleString()}</span>
              </div>
              <div>
                <span className="meta-label">CWD</span>
                <code>{trace.manifest.metadata.environment.cwd}</code>
              </div>
              <div>
                <span className="meta-label">Node</span>
                <code>{trace.manifest.metadata.environment.nodeVersion}</code>
              </div>
            </div>
          </section>

          <section className="panel filters">
            <div className="filter-grid">
              <label className="field">
                <span>Source</span>
                <select
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}
                >
                  <option value="all">all</option>
                  <option value="terminal">terminal</option>
                  <option value="mcp">mcp</option>
                  <option value="browser">browser</option>
                </select>
              </label>

              <label className="field">
                <span>Search events</span>
                <input
                  type="text"
                  placeholder="error, stdout, tool.called..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="panel">
            <h2>Event counts</h2>
            <div className="chip-row">
              {Object.entries(eventTypeCounts).map(([eventType, count]) => (
                <span key={eventType} className="chip">
                  {eventType}: {count}
                </span>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="timeline-header">
              <h2>Artifacts</h2>
              <span>{trace.manifest.artifacts.length} bundle artifacts</span>
            </div>

            {trace.manifest.artifacts.length > 0 ? (
              <div className="artifact-grid">
                {trace.manifest.artifacts.map((artifact) => (
                  <ArtifactPreview key={artifact.id} artifactId={artifact.id} trace={trace} />
                ))}
              </div>
            ) : (
              <p>No artifacts available in this trace bundle.</p>
            )}
          </section>

          <section className="panel timeline">
            <div className="timeline-header">
              <h2>Step timeline</h2>
              <span>{visibleStepGroups.length} visible step groups</span>
            </div>

            <div className="filter-toggle-row">
              <label className="toggle-chip">
                <input
                  type="checkbox"
                  checked={showFailuresFirst}
                  onChange={(event) => setShowFailuresFirst(event.target.checked)}
                />
                <span>Failures first</span>
              </label>

              <label className="toggle-chip">
                <input
                  type="checkbox"
                  checked={onlyFailures}
                  onChange={(event) => setOnlyFailures(event.target.checked)}
                />
                <span>Only failures</span>
              </label>
            </div>

            <div className="step-group-list">
              {visibleStepGroups.map((group) => {
                const expanded =
                  expandedStepIds[group.key] ??
                  (group.status === "failed" ||
                    group.failedAssertionCount > 0 ||
                    (focusedStepId !== null && group.stepId === focusedStepId));

                const renderableItems = buildRenderableTimelineItems(group.events);
                const seenOutputAnchorKeys = new Set<string>();

                return (
                  <details
                    key={group.key}
                    className={`step-group-card step-group-${group.status} ${
                      focusedStepId !== null && group.stepId === focusedStepId ? "step-group-focused" : ""
                    }`}
                    open={expanded}
                    onToggle={(event) => {
                      const nextOpen = (event.currentTarget as HTMLDetailsElement).open;
                      setExpandedStepIds((current) => ({
                        ...current,
                        [group.key]: nextOpen
                      }));
                    }}
                  >
                    <summary className="step-group-summary">
                      <div className="step-group-left">
                        <span className={`step-status-badge badge-${group.status}`}>{group.status}</span>
                        <div className="step-group-heading">
                          <strong>{group.title}</strong>
                          <span>
                            {group.stepId ?? "no-step-id"} · {group.eventCount} events · {group.source}
                          </span>
                        </div>
                      </div>

                      <div className="step-group-right">
                        {group.failedAssertionCount > 0 ? (
                          <span className="focused-step-pill">
                            {group.failedAssertionCount} failed assertion{group.failedAssertionCount > 1 ? "s" : ""}
                          </span>
                        ) : null}
                      </div>
                    </summary>

                    <div className="step-group-body">
                      <div className="step-group-meta">
                        <span>Started: {new Date(group.startedAt).toLocaleString()}</span>
                        <span>Ended: {new Date(group.endedAt).toLocaleString()}</span>
                        <span>Artifacts: {group.artifactIds.length}</span>
                      </div>

                      <div className="timeline-list">
                        {renderableItems.map((item: RenderableTimelineItem) => {
                          if (item.kind === "output-block") {
                            const outputKey = item.stepId ? outputTargetKey(item.stepId, item.stream) : undefined;
                            const shouldRegisterOutputAnchor =
                              Boolean(outputKey) && !seenOutputAnchorKeys.has(outputKey!);

                            if (shouldRegisterOutputAnchor && outputKey) {
                              seenOutputAnchorKeys.add(outputKey);
                            }

                            return (
                              <OutputBlockCard
                                key={item.key}
                                block={item}
                                trace={trace}
                                highlighted={focusedStepId !== null && item.stepId === focusedStepId}
                                streamFocused={
                                  focusedOutputTarget !== null &&
                                  focusedOutputTarget.stepId === item.stepId &&
                                  focusedOutputTarget.stream === item.stream
                                }
                                registerAnchor={
                                  shouldRegisterOutputAnchor && outputKey
                                    ? (node) => {
                                        outputBlockAnchorMapRef.current[outputKey] = node;
                                      }
                                    : undefined
                                }
                              />
                            );
                          }

                          const event = item.event;
                          const anchorEventId = event.stepId ? firstEventIdByStep[event.stepId] : undefined;

                          return (
                            <TimelineItem
                              key={event.eventId}
                              event={event}
                              trace={trace}
                              relatedArtifactIds={relatedArtifactIdsForEvent(event, stepArtifactIndex)}
                              highlighted={focusedStepId !== null && event.stepId === focusedStepId}
                              registerAnchor={
                                anchorEventId === event.eventId && event.stepId
                                  ? (node) => {
                                      stepAnchorMapRef.current[event.stepId!] = node;
                                    }
                                  : undefined
                              }
                              onFocusAssertions={focusStepInAssertions}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <section className="panel empty-state">
          <h2>No trace loaded yet</h2>
          <p>
            Start from the CLI with <code>traceforge view &lt;bundleDir&gt;</code> or load <code>manifest.json</code>
            and <code>events.ndjson</code> manually.
          </p>
        </section>
      )}
    </main>
  );
}

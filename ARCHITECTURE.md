# Traceforge Architecture

See also:
- overview and positioning: `README.md`
- milestones and delivery plan: `ROADMAP.md`

## Goal

Traceforge is an open-source replay and regression testing layer for AI agents.

Its job is simple:

1. capture real runs from terminal, MCP, and browser tools
2. normalize them into one canonical trace format
3. replay important checkpoints
4. export portable debugging and regression assets

Traceforge is not an agent runtime.
It is the verification layer around existing agent workflows.

## Product Thesis

Modern agent workflows fail in ways that are expensive and hard to reproduce.

Terminal logs are incomplete.
MCP calls are buried in protocol output.
Browser failures are spread across screenshots, console logs, and guesswork.
Even when a team fixes an issue once, they rarely turn that incident into a regression test.

Traceforge turns disposable runs into engineering assets:

- traces
- artifacts
- fixtures
- replay results
- regression tests

## Non-Goals

The MVP does not try to be:

- a general-purpose agent framework
- an MCP registry or router
- a hosted observability dashboard
- a cloud orchestration platform
- a perfect deterministic time-travel debugger
- a multi-language SDK platform from day one

## Architecture Principles

1. Schema first.
2. Local first.
3. Thin adapters.
4. Checkpoint replay over full determinism.
5. Portable debugging assets.

## System Overview

```text
Terminal / MCP / Browser
  -> Capture Adapters
  -> Canonical Event Schema
  -> Trace Bundle
  -> Viewer / Replay / Export
```

## Package Layout

```text
apps/
  cli/
  viewer/

packages/
  schema/
  core/
  adapter-terminal/
  adapter-mcp/
  fixtures/
```

## Trace Bundle Format

```text
run-001/
  manifest.json
  events.ndjson
  replay-report.json
  artifacts/
    stdout.txt
    stderr.txt
    replay-stdout.txt
    replay-stderr.txt
```

## Core Technical Choices

- TypeScript on Node 20+
- pnpm workspaces + changesets
- zod for the canonical schema
- commander for the CLI
- React + Vite for the local viewer
- local bridge HTTP server for bundle viewing
- folder-based trace bundle as the source of truth

## Implementation Order

1. schema
2. bundle format
3. CLI skeleton
4. terminal capture
5. local viewer
6. replay engine
7. export/test generation
8. MCP adapter
9. browser adapter

## Constraint

Traceforge wins only if the first version stays narrow.

The first version should remain laser-focused on one outcome:

**make any agent run reproducible**

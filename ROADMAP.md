# Traceforge Roadmap

See also:
- product overview: `README.md`
- system design: `ARCHITECTURE.md`

Traceforge is an open-source replay and regression testing layer for AI agents.

The MVP goal is narrow and practical:

`capture a real run -> inspect it locally -> replay key checkpoints -> export a reusable test asset`

## Current Status

### In scope
- TypeScript-first monorepo
- local-first trace bundles
- terminal, MCP, and browser adapters
- local viewer
- replay with checkpoint assertions
- export to regression fixtures and test templates

### Out of scope for MVP
- hosted cloud service
- distributed orchestration
- full deterministic replay
- multi-language SDK matrix
- enterprise governance features
- deep analytics dashboard

## MVP Definition

The MVP is successful if a developer can:

1. run `traceforge capture -- <command>`
2. get a valid local trace bundle
3. inspect the run in a local viewer
4. replay the bundle and see where it diverged
5. export a starter regression test

## Milestone 0 - Foundation
- monorepo initialized
- schema package created
- canonical event model defined
- trace bundle format locked
- basic CLI scaffold working
- architecture and roadmap docs published

## Milestone 1 - Terminal Capture
- terminal capture adapter
- stdout/stderr streaming to `events.ndjson`
- exit code checkpoint
- bundle manifest writing
- local trace directory creation

## Milestone 2 - Local Viewer
- local viewer app
- open trace bundle from disk
- step-grouped timeline
- artifact preview
- replay summary and assertions

## Milestone 3 - Replay and Export
- replay command for terminal bundles
- checkpoint assertions
- replay result summary
- markdown incident report export
- Vitest fixture/test template export

## Milestone 4 - MCP Adapter
- MCP adapter package
- request/response capture
- tool call event mapping
- protocol error vs SDK error classification

## Milestone 5 - Browser Adapter
- Playwright-backed browser adapter
- action events
- selected screenshots
- URL and console metadata

## Guiding Rule

If a feature does not directly strengthen:

`capture -> inspect -> replay -> export`

it probably does not belong in the first version.

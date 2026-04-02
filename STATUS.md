# Current Status

Last updated: 2026-03-31

## Product direction

Traceforge is positioned as an open-source replay and regression-testing layer for AI agents.

Core loop:

`capture -> inspect -> replay -> export test`

Current capture sources:

- terminal
- mcp
- browser

## Implemented project areas

### Monorepo and docs

- `README.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`
- pnpm workspace with apps and packages

### Schema and bundle contract

- Canonical trace schema in `packages/schema/src/index.ts`
- Folder-based bundle format with:
  - `manifest.json`
  - `events.ndjson`
  - `replay-report.json` when available
  - `artifacts/`
- Shared capabilities contract now uses normalized descriptors:
  - `supported`
  - `unsupported`
  - `partial`
- Legacy boolean capability inputs are still accepted and normalized on read

### Terminal flow

- `capture` command implemented
- Terminal bundle writing implemented
- Terminal replay implemented
- Terminal export-test implemented

### MCP flow

- MCP adapter helpers implemented
- Real stdio MCP tool capture implemented via `capture-mcp`
- MCP tool listing implemented via `list-mcp-tools`
- MCP pre-call tool validation implemented
- MCP export-test implemented
- MCP replay currently writes an explicit unsupported replay report

### Browser flow

- First browser capture implemented via Playwright and `capture-browser`
- Browser bundle includes screenshot, HTML, console output, and page metadata artifacts
- Browser export-test implemented as a generated Playwright/Vitest scaffold
- Browser replay currently writes an explicit unsupported replay report

### Viewer and CLI downstream surfaces

- `view` command implemented
- `view --json` implemented for script-friendly machine output
- `view --no-open` and `view --print-url` implemented
- Viewer supports:
  - run summary
  - capability panel
  - replay summary
  - replay assertions
  - step-grouped timeline
  - output folding
  - artifact preview
  - timeline/assertion cross-linking

## Capability semantics

Current canonical semantics by source:

### terminal

- replay: `supported`
- export-test: `supported`
- view: `supported`

### mcp

- replay: `unsupported`
- export-test: `supported`
- view: `supported`

### browser

- replay: `unsupported`
- export-test: `partial`
- view: `supported`

Notes:

- Browser export-test is intentionally framed as best-effort scaffolding from captured URL and page metadata.
- Unsupported replay paths generate a real `replay-report.json` instead of failing silently.

## Example commands that work now

### Terminal

```bash
node "apps/cli/dist/index.js" capture -- node -e "process.stdout.write('ok\n'); process.exit(0)"
node "apps/cli/dist/index.js" replay ".traceforge/traces/run_txw5ghm9"
node "apps/cli/dist/index.js" export-test "run_txw5ghm9"
```

### MCP

```bash
node "apps/cli/dist/index.js" list-mcp-tools --server-command node --server-arg "examples/mcp-server/echo-server.mjs"
node "apps/cli/dist/index.js" capture-mcp --server-command node --server-arg "examples/mcp-server/echo-server.mjs" --tool echo --args-json "{\"message\":\"hello from cli\"}" -o ".traceforge/traces"
node "apps/cli/dist/index.js" export-test "run_1bfz2oaj"
node "apps/cli/dist/index.js" replay "run_1bfz2oaj"
```

### Browser

```bash
node "apps/cli/dist/index.js" capture-browser --url "data:text/html,<title>Traceforge Browser</title><h1>Hello</h1>" --wait-ms 25 -o ".traceforge/traces"
node "apps/cli/dist/index.js" export-test "run_vtjd0y4h"
node "apps/cli/dist/index.js" view "run_vtjd0y4h" --no-open --json
```

## Verified state

The repository has passed these checks after the latest changes:

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:generated`

Additional smoke coverage completed:

- terminal capture / replay / export-test
- MCP list-tools
- MCP capture -> export-test -> generated test
- MCP replay unsupported report generation
- browser capture -> export-test -> generated test
- `view --json` output with normalized capabilities

## Useful trace bundles created during smoke tests

- terminal: `.traceforge/traces/run_txw5ghm9`
- mcp: `.traceforge/traces/run_1bfz2oaj`
- browser: `.traceforge/traces/run_vtjd0y4h`

These are helpful for local inspection and regression while iterating.

## Current repository shape

Important packages/apps:

- `apps/cli`
- `apps/viewer`
- `packages/schema`
- `packages/core`
- `packages/adapter-terminal`
- `packages/adapter-mcp`
- `packages/adapter-browser`
- `packages/fixtures`

Examples:

- `examples/mcp-server/echo-server.mjs`
- `examples/mcp-client/traced-client.ts`

## Most important next steps

1. Stabilize capability reasons into a more machine-friendly structure such as `code + message`
2. Add a canonical golden fixture for the normalized capability contract
3. Add a downstream action panel in the viewer driven purely by capabilities
4. Consider browser replay semantics only after the current bundle-first contract is frozen

## Important constraints to preserve

- Keep one bundle-first downstream contract across terminal, MCP, and browser
- Keep browser export-test explicitly best-effort
- Keep MCP validation narrow: tool existence and obvious pre-call failures only
- Avoid letting source-specific logic leak into viewer and CLI beyond capability interpretation

# Traceforge

[English](README.md) | [简体中文](README.zh-CN.md)

> Open-source replay and regression testing for AI agents.
>
> Capture real runs. Replay failures. Export tests.

Traceforge makes agent runs reproducible.

It records what actually happened across terminal, MCP, and browser tools,
packages the run into a portable trace bundle, helps you inspect where it failed,
and turns real failures into regression fixtures and tests.

## Why

Modern agent workflows are powerful, but hard to trust.

- terminal output is incomplete
- MCP calls are buried in protocol logs
- browser failures are hard to reproduce
- expensive incidents rarely become tests
- teams fix failures once, then see them return later

Traceforge solves one narrow problem well:

`capture -> inspect -> replay -> export test`

It is not another agent framework.
It is the verification layer for the agent ecosystem.

## What You Get

- unified traces from terminal, MCP, and browser runs
- a local trace viewer with timeline, artifacts, and failure boundaries
- replay that re-runs a flow and checks where it diverges
- export to reusable regression fixtures and test templates
- shareable trace bundles for debugging and collaboration

## CLI

```bash
traceforge capture -- node -v
traceforge view ./.traceforge/traces/run_xxxxxxxx
traceforge replay ./.traceforge/traces/run_xxxxxxxx
traceforge export-test ./.traceforge/traces/run_xxxxxxxx
```

## Install From Source

Traceforge is currently in early alpha.

Requirements:

- Node.js 20+
- pnpm 10.6.0+

```bash
pnpm install
pnpm build
```

## Development

Run the main verification commands:

```bash
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm test:generated
```

Useful local entry points:

```bash
pnpm dev:cli
pnpm dev:viewer
```

## Repository Layout

- `apps/cli` - CLI entrypoint and local trace bridge
- `apps/viewer` - local viewer UI
- `packages/schema` - canonical trace schema and capability contract
- `packages/core` - bundle, replay, and view-server helpers
- `packages/adapter-*` - terminal, MCP, and browser capture adapters
- `packages/fixtures` - exported regression test templates
- `examples/` - runnable examples and smoke helpers

## Contributing

Contribution guidance lives in `CONTRIBUTING.md`.

If you change a publishable package, add a changeset with:

```bash
pnpm changeset
```

## Security

Please report security issues privately.
See `SECURITY.md` for the current policy.

## License

MIT. See `LICENSE`.

## Friendly Links

- [linux.do](https://linux.do/)

## Repository Guide

- Product and system design: `ARCHITECTURE.md`
- Delivery plan and milestones: `ROADMAP.md`

## Status

Early alpha.

The mission is simple:

**Make any agent run reproducible.**

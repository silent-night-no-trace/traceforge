# Contributing to Traceforge

Thanks for helping improve Traceforge.

## Before you start

- Read `README.md` for product positioning and quick usage.
- Read `ARCHITECTURE.md` and `ROADMAP.md` before making structural changes.
- Keep changes aligned with the core loop: `capture -> inspect -> replay -> export test`.

## Local setup

Requirements:

- Node.js 20+
- pnpm 10.6.0+

Install dependencies:

```bash
pnpm install
```

## Common commands

```bash
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm test:generated
```

Useful development entry points:

```bash
pnpm dev:cli
pnpm dev:viewer
```

## Repository layout

- `apps/cli` - command-line entrypoint and trace viewing bridge
- `apps/viewer` - local trace viewer
- `packages/schema` - canonical trace schema and capability contract
- `packages/core` - bundle, replay, and view-server helpers
- `packages/adapter-*` - source-specific capture adapters
- `packages/fixtures` - exported regression test templates
- `examples/` - runnable examples and smoke-test helpers

## Pull request checklist

Before opening a PR:

1. Keep changes scoped and explain the user-facing impact.
2. Add or update tests for behavior changes.
3. Run `pnpm typecheck`, `pnpm test`, and `pnpm build`.
4. If you touch export flows, also run `pnpm test:generated`.
5. Update docs when behavior, commands, or capabilities change.

## Changesets and releases

Public packages in this monorepo are versioned with Changesets.

If your change affects a published package, add a changeset:

```bash
pnpm changeset
```

## Security

Do not file public issues for suspected vulnerabilities.
Follow `SECURITY.md` for private reporting guidance.

## Code of conduct

This project follows the expectations in `CODE_OF_CONDUCT.md`.

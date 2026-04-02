# Security Policy

## Supported versions

Traceforge is currently in early alpha.

- Supported: latest code on the default branch
- Not supported: historical snapshots, stale forks, and modified downstream builds

## Reporting a vulnerability

Please do not open public GitHub issues for security reports.

Instead:

1. Use the repository's private vulnerability reporting channel when it is enabled.
2. If that channel is not yet available, contact the project maintainers privately through the repository hosting platform.
3. Include reproduction steps, impact, affected files, and any suggested mitigation.

We will aim to acknowledge credible reports promptly and coordinate a fix before public disclosure.

## Scope

Relevant reports include, for example:

- command execution or sandbox escapes
- sensitive data leakage in trace bundles or exports
- unsafe file serving in the local viewer bridge
- dependency or supply-chain issues with demonstrated impact on Traceforge users

Reports that only describe unsupported alpha behavior without a security impact may be reclassified as regular bugs.

# MCP Example

This folder contains a minimal runnable MCP example for Traceforge.

## Files

- `examples/mcp-server/echo-server.mjs` - stdio MCP server with `echo` and `sum` tools
- `examples/mcp-client/traced-client.ts` - Traceforge adapter client that connects to the server and prints traced events

## Run

```bash
pnpm exec tsx examples/mcp-client/traced-client.ts
```

The client spawns the local stdio server, calls the `echo` tool, and prints the traced MCP events.

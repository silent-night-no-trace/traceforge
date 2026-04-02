import { resolve } from "node:path";
import { connectTracingStdioMcpClient } from "../../packages/adapter-mcp/src/index.ts";

async function main() {
  const serverPath = resolve(process.cwd(), "examples", "mcp-server", "echo-server.mjs");

  const emittedTypes: string[] = [];

  const client = await connectTracingStdioMcpClient({
    command: process.execPath,
    args: [serverPath],
    emitEvents: async (events) => {
      emittedTypes.push(...events.map((event) => event.type));
    }
  });

  const traced = await client.callTool({
    context: {
      runId: "example_run",
      stepId: "step_echo",
      toolName: "echo"
    },
    arguments: {
      message: "hello from Traceforge"
    }
  });

  console.log("Emitted event types:", emittedTypes.join(", "));
  console.log(JSON.stringify(traced.events, null, 2));

  await client.close();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

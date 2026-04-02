import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "traceforge-echo-server",
  version: "0.1.0"
});

server.tool("echo", "Echo a message back to the caller", { message: z.string() }, async ({ message }) => {
  return {
    content: [
      {
        type: "text",
        text: message
      }
    ],
    structuredContent: {
      echoed: message
    }
  };
});

server.tool(
  "sum",
  "Add two numbers together",
  {
    a: z.number(),
    b: z.number()
  },
  async ({ a, b }) => {
    const total = a + b;

    return {
      content: [
        {
          type: "text",
          text: String(total)
        }
      ],
      structuredContent: {
        total
      }
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Traceforge MCP echo server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in MCP echo server:", error);
  process.exit(1);
});

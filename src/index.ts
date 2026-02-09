#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/index.js";

const AMBOSS_API_KEY = process.env.AMBOSS_API_KEY;

const server = new McpServer({
  name: "lightning-mcp-server",
  version: "1.0.0",
});

registerAllTools(server, AMBOSS_API_KEY);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("lightning-mcp-server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

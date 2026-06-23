#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { handleWorkflowTool, workflowTools } from './tools/workflow-tools.js';

const server = new Server(
  { name: 'oflow-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: workflowTools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = await handleWorkflowTool(request.params.name, (request.params.arguments ?? {}) as Record<string, unknown>);
  if (result) return result;
  return { content: [{ type: 'text', text: `❌ Unknown tool: ${request.params.name}` }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);

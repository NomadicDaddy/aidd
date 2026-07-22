import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import type { AiddApiClient } from '../channels/apiClient.ts';

import { asArgs, TOOLS, type ChatState, type JsonSchema } from './tools.ts';

/**
 * aidd exposed as MCP tools over stdio.
 *
 * Every tool is a thin wrapper over an existing web API route via the shared
 * {@link AiddApiClient}; no new backend behavior is introduced here. The tool catalog lives in
 * tools.ts; this module owns the SDK-independent dispatcher and the MCP server wiring.
 */

export interface ToolListing {
	description: string;
	inputSchema: JsonSchema;
	name: string;
}

export interface ToolCallResult {
	isError: boolean;
	text: string;
}

export interface AiddToolDispatcher {
	call(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
	listings: ToolListing[];
}

/**
 * The SDK-independent core: the tool catalog plus a dispatcher that runs a tool
 * by name and returns text/isError. Kept separate from {@link createAiddMcpServer}
 * so it can be exercised without an MCP transport.
 */
export function createToolDispatcher(client: AiddApiClient): AiddToolDispatcher {
	const state: ChatState = { sessionId: undefined };
	const byName = new Map(TOOLS.map((tool) => [tool.name, tool]));
	return {
		async call(name, args): Promise<ToolCallResult> {
			const tool = byName.get(name);
			if (!tool) return { isError: true, text: `Unknown tool: ${name}` };
			try {
				const result = await tool.handler(client, args, state);
				return { isError: false, text: JSON.stringify(result, null, 2) };
			} catch (err) {
				return {
					isError: true,
					text: err instanceof Error ? err.message : String(err),
				};
			}
		},
		listings: TOOLS.map(({ description, inputSchema, name }) => ({
			description,
			inputSchema,
			name,
		})),
	};
}

export function createAiddMcpServer(client: AiddApiClient, serverVersion: string): Server {
	const server = new Server(
		{ name: 'aidd', version: serverVersion },
		{ capabilities: { tools: {} } }
	);
	const dispatcher = createToolDispatcher(client);

	server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: dispatcher.listings }));

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { isError, text } = await dispatcher.call(
			request.params.name,
			asArgs(request.params.arguments)
		);
		return { content: [{ text, type: 'text' }], isError };
	});

	return server;
}

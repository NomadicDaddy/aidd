import type { ResolvedConfig } from 'aidd-shared/config';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createApiClient, isBackendReachable } from '../channels/apiClient.ts';
import { createAiddMcpServer } from './server.ts';

export interface StartMcpServerOptions {
	rootDir: string;
}

async function readVersion(rootDir: string): Promise<string> {
	try {
		return (await readFile(join(rootDir, 'VERSION'), 'utf8')).trim();
	} catch {
		return 'unknown';
	}
}

/**
 * Run the aidd MCP server over stdio. Tools proxy the local web API, so the web
 * backend must be running. stdout is reserved for the MCP wire protocol — all
 * status output goes to stderr.
 */
export async function startMcpServer(
	config: ResolvedConfig,
	options: StartMcpServerOptions,
): Promise<number> {
	const port = config.web?.port ?? 3210;
	const client = createApiClient({
		port,
		...(config.web?.authToken ? { authToken: config.web.authToken } : {}),
	});
	const server = createAiddMcpServer(client, await readVersion(options.rootDir));
	const transport = new StdioServerTransport();
	await server.connect(transport);
	// The web backend is required (the MCP tools proxy it). Probe it once and warn
	// loudly on stderr if it is down, instead of leaving tool calls to fail opaquely.
	// Non-fatal: the server stays up so the backend can be started afterwards.
	if (await isBackendReachable(client.baseUrl)) {
		console.error(`aidd MCP server ready (stdio) — proxying ${client.baseUrl}`);
	} else {
		console.error(
			`aidd MCP server ready (stdio), but the web backend at ${client.baseUrl} is not reachable. ` +
				'Start it with `bun run start:web`; tool calls will fail until it is running.',
		);
	}
	return await new Promise<number>((resolve) => {
		const shutdown = () => {
			void server.close();
			resolve(0);
		};
		transport.onclose = shutdown;
		process.once('SIGINT', shutdown);
		process.once('SIGTERM', shutdown);
	});
}

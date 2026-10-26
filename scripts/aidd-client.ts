import type { ResolvedWebConfig } from 'aidd-shared/config';

import { isWildcardHostname } from 'aidd-shared';
import { parseArgs as parseAiddArgs } from 'aidd-shared/args/index';
import { resolveConfig } from 'aidd-shared/config';
/**
 * Minimal authenticated reference client for the aidd web API.
 *
 * Reads `web.hostname` / `web.port` / `web.authToken` from the resolved config and
 * defaults to `GET /api/v1/projects`, printing the result. Explicit POST requests
 * accept a UTF-8 JSON body file for native skill imports and session launches.
 *
 * Point `--host` at the bound tailnet address to actually exercise the bearer guard —
 * a `127.0.0.1` request is loopback-exempt and would pass without the token.
 *
 *   bun run aidd-client                          # configured host, default path
 *   bun run aidd-client -- --host 100.x.y.z      # exercise the token over the tailnet
 *   bun run aidd-client -- --path /api/v1/runs   # any GET endpoint
 *   bun run aidd-client -- --method POST --path <endpoint> --body-file <request.json>
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs as parseNodeArgs } from 'node:util';

const repoRoot = resolve(import.meta.dirname, '..');

export interface ApiClientRequest {
	body?: string;
	host?: string;
	method: 'GET' | 'POST';
	path: string;
}

export async function parseClientRequest(argv: string[]): Promise<ApiClientRequest> {
	const { values } = parseNodeArgs({
		args: argv,
		options: {
			'body-file': { type: 'string' },
			host: { type: 'string' },
			method: { type: 'string' },
			path: { type: 'string' },
		},
		strict: true,
	});
	const method = values.method ?? 'GET';
	if (method !== 'GET' && method !== 'POST') throw new Error('method must be GET or POST');
	if (values['body-file'] && method !== 'POST') throw new Error('body-file requires POST');
	const body = values['body-file'] ? await readFile(values['body-file'], 'utf8') : undefined;
	if (body !== undefined) JSON.parse(body);
	return {
		...(body !== undefined ? { body } : {}),
		...(values.host !== undefined ? { host: values.host } : {}),
		method,
		path: values.path ?? '/api/v1/projects',
	};
}

export async function requestApi(
	web: Pick<ResolvedWebConfig, 'authToken' | 'hostname' | 'port'>,
	request: ApiClientRequest,
): Promise<number> {
	// A wildcard bind is not a connectable target; fall back to loopback.
	const configuredHost = isWildcardHostname(web.hostname) ? '127.0.0.1' : web.hostname;
	const host = request.host ?? configuredHost;
	const path = request.path;
	const url = `http://${host.includes(':') ? `[${host}]` : host}:${web.port}${path}`;

	const headers: Record<string, string> = {};
	if (web.authToken) headers.authorization = `Bearer ${web.authToken}`;
	if (request.body !== undefined) headers['content-type'] = 'application/json';

	const response = await fetch(url, {
		...(request.body !== undefined ? { body: request.body } : {}),
		headers,
		method: request.method,
	});
	const body = await response.text();
	console.log(`${request.method} ${url} -> ${response.status} ${response.statusText}`);
	console.log(body);
	return response.ok ? 0 : 1;
}

export async function main(argv: string[]): Promise<number> {
	const request = await parseClientRequest(argv);
	const config = await resolveConfig(parseAiddArgs([]), { baseDir: repoRoot });
	return await requestApi(config.web, request);
}

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}

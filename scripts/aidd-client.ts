import { isWildcardHostname } from 'aidd-shared';
import { parseArgs as parseAiddArgs } from 'aidd-shared/args/index';
import { resolveConfig } from 'aidd-shared/config';
/**
 * Minimal authenticated reference client for the aidd web API.
 *
 * Reads `web.hostname` / `web.port` / `web.authToken` from the resolved config and
 * issues an authenticated `GET /api/v1/projects`, printing the result. This is the
 * worked example for the "headless API" channel and the Phase 0 smoke handle.
 *
 * Point `--host` at the bound tailnet address to actually exercise the bearer guard —
 * a `127.0.0.1` request is loopback-exempt and would pass without the token.
 *
 *   bun scripts/aidd-client.ts                       # configured host, default path
 *   bun scripts/aidd-client.ts --host 100.x.y.z      # exercise the token over the tailnet
 *   bun scripts/aidd-client.ts --path /api/v1/runs   # any GET endpoint
 */
import { resolve } from 'node:path';
import { parseArgs as parseNodeArgs } from 'node:util';

const repoRoot = resolve(import.meta.dirname, '..');

export async function main(argv: string[]): Promise<number> {
	const { values } = parseNodeArgs({
		args: argv,
		options: {
			host: { type: 'string' },
			path: { type: 'string' },
		},
		strict: true,
	});

	const config = await resolveConfig(parseAiddArgs([]), { baseDir: repoRoot });
	const web = config.web;
	if (!web) {
		console.error('No web configuration resolved.');
		return 1;
	}

	// A wildcard bind is not a connectable target; fall back to loopback.
	const configuredHost = isWildcardHostname(web.hostname) ? '127.0.0.1' : web.hostname;
	const host = values.host ?? configuredHost;
	const path = values.path ?? '/api/v1/projects';
	const url = `http://${host.includes(':') ? `[${host}]` : host}:${web.port}${path}`;

	const headers: Record<string, string> = {};
	if (web.authToken) headers.authorization = `Bearer ${web.authToken}`;

	const response = await fetch(url, { headers });
	const body = await response.text();
	console.log(`GET ${url} -> ${response.status} ${response.statusText}`);
	console.log(body);
	return response.ok ? 0 : 1;
}

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}

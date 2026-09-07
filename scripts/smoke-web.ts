#!/usr/bin/env bun
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { parseCrawlArgs, resolveCrawlArgs } from './crawltest-config.ts';

const rootDir = resolve(import.meta.dirname, '..');

export async function resolveSmokeWebArgs(argv: string[], root = rootDir) {
	const { values } = parseArgs({
		args: argv,
		options: {
			'404': { type: 'boolean' },
			'base-url': { type: 'string' },
			bug: { type: 'boolean' },
			'bug-project': { type: 'string' },
			'local-network': { type: 'boolean' },
			'local-network-host': { type: 'string' },
			page: { type: 'string' },
			'screenshot-pages': { type: 'boolean' },
			'start-from': { type: 'string' },
			viewport: { type: 'string' },
		},
		strict: true,
	});
	const forwarded = Object.entries(values).flatMap(([name, value]) =>
		typeof value === 'string' ? [`--${name}`, value] : value ? [`--${name}`] : [],
	);
	const args = await resolveCrawlArgs(parseCrawlArgs(forwarded), root);
	return {
		baseUrl: args.baseUrl,
		crawlArgs: ['scripts/crawltest.ts', '--404', ...forwarded, '--base-url', args.baseUrl],
	};
}

function runBun(args: string[]): number {
	const result = Bun.spawnSync([process.execPath, ...args], {
		cwd: rootDir,
		stderr: 'inherit',
		stdout: 'inherit',
		windowsHide: true,
	});
	return result.exitCode ?? 1;
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let lastError = '';
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
			lastError = `status ${response.status}`;
		} catch (err) {
			lastError = err instanceof Error ? err.message : String(err);
		}
		await Bun.sleep(500);
	}
	throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function main(): Promise<number> {
	try {
		const { baseUrl, crawlArgs } = await resolveSmokeWebArgs(Bun.argv.slice(2));
		await waitForHttp(new URL('/api/v1/health', baseUrl).toString(), 60_000);

		const crawlExit = runBun(crawlArgs);
		const analyzeExit = runBun(['scripts/crawltest-analyze.ts']);
		return crawlExit !== 0 ? crawlExit : analyzeExit;
	} catch (err) {
		console.error(err instanceof Error ? err.message : String(err));
		return 1;
	}
}

if (import.meta.main) {
	process.exit(await main());
}

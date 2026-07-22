#!/usr/bin/env bun
import { resolve } from 'node:path';

import { resolveDefaultBaseUrl } from './crawltest-config.ts';

const rootDir = resolve(import.meta.dirname, '..');

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
	const screenshotPages = Bun.argv.includes('--screenshot-pages');
	const baseUrl = await resolveDefaultBaseUrl(rootDir);

	try {
		await waitForHttp(new URL('/api/v1/health', baseUrl).toString(), 60_000);

		const crawlArgs = ['scripts/crawltest.ts', '--404'];
		if (screenshotPages) crawlArgs.push('--screenshot-pages');
		const crawlExit = runBun(crawlArgs);
		const analyzeExit = runBun(['scripts/crawltest-analyze.ts']);
		return crawlExit !== 0 ? crawlExit : analyzeExit;
	} catch {
		return 1;
	}
}

if (import.meta.main) {
	process.exit(await main());
}

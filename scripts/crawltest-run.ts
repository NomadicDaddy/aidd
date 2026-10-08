#!/usr/bin/env bun
import { resolve } from 'node:path';

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

const crawlArgs = Bun.argv.slice(2);
const crawlExit = runBun(['scripts/crawltest.ts', ...crawlArgs]);
// The analyzer reads the evidence file the crawl wrote, so it takes the same viewport.
const viewportIndex = crawlArgs.indexOf('--viewport');
const viewportArgs = viewportIndex === -1 ? [] : ['--viewport', crawlArgs[viewportIndex + 1] ?? ''];
const analyzeExit = runBun(['scripts/crawltest-analyze.ts', ...viewportArgs]);

process.exit(crawlExit !== 0 ? crawlExit : analyzeExit);

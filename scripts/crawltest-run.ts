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

const crawlExit = runBun(['scripts/crawltest.ts', ...Bun.argv.slice(2)]);
const analyzeExit = runBun(['scripts/crawltest-analyze.ts']);

process.exit(crawlExit !== 0 ? crawlExit : analyzeExit);

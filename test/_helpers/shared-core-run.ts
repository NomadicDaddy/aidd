import { chdir, cwd } from 'node:process';

import { parseSharedCoreArgs, runSharedCoreSync } from '../../scripts/sync-shared-core.ts';

/**
 * Runs the delivered sync's entry point in process, from `root`, as
 * `bun scripts/sync-shared-core.ts <args>` would there, and returns its exit code with everything
 * it printed. In process, because a spawned copy would not be measured; the cost is that this
 * exercises the exported parser and runner and not the command line or the package script.
 */
export function runSharedCoreFrom(root: string, ...args: string[]): { code: number; out: string } {
	const lines: string[] = [];
	const original = {
		error: console.error,
		info: console.info,
		log: console.log,
		warn: console.warn,
	};
	const collect = (...parts: unknown[]): void => {
		lines.push(parts.map(String).join(' '));
	};
	const before = cwd();
	// The delivered sync reports its result through console.info since smokestack v0.5.1.
	console.info = collect;
	console.log = collect;
	console.warn = collect;
	console.error = collect;
	chdir(root);
	try {
		return { code: runSharedCoreSync(parseSharedCoreArgs(args)), out: lines.join('\n') };
	} finally {
		chdir(before);
		console.info = original.info;
		console.log = original.log;
		console.warn = original.warn;
		console.error = original.error;
	}
}

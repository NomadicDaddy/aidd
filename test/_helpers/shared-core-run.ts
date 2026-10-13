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
	const original = { error: console.error, log: console.log, warn: console.warn };
	const collect = (...parts: unknown[]): void => {
		lines.push(parts.map(String).join(' '));
	};
	const before = cwd();
	console.log = collect;
	console.warn = collect;
	console.error = collect;
	chdir(root);
	try {
		return { code: runSharedCoreSync(parseSharedCoreArgs(args)), out: lines.join('\n') };
	} finally {
		chdir(before);
		console.log = original.log;
		console.warn = original.warn;
		console.error = original.error;
	}
}

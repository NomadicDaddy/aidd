/**
 * Fresh-release baseline validation.
 *
 * Enforces: DATA-003 -- structured artifacts are append-safe and parseable, checked against the
 * baseline a fresh release must present before it ships.
 */
import { cwd, exit } from 'node:process';

import { validateFreshRelease } from './lib/fresh-release/validation.ts';
import { errorMessage } from './lib/release/common.ts';

export async function runFreshRelease(rootDir = cwd()): Promise<number> {
	try {
		const issues = await validateFreshRelease(rootDir);
		if (issues.length > 0) {
			console.error('[FAIL] fresh-release baseline validation failed:');
			for (const issue of issues) console.error(`- ${issue}`);
			return 1;
		}
		console.log('[OK] fresh-release: tracked content starts at the public baseline');
		return 0;
	} catch (err) {
		console.error(`[FAIL] ${errorMessage(err)}`);
		return 2;
	}
}

if (import.meta.main) exit(await runFreshRelease());

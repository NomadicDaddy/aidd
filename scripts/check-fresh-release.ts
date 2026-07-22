import { cwd, exit } from 'node:process';

import { validateFreshRelease } from './lib/fresh-release/validation.ts';
import { errorMessage } from './lib/release/common.ts';

export async function main(rootDir = cwd()): Promise<number> {
	try {
		const issues = await validateFreshRelease(rootDir);
		if (issues.length > 0) {
			console.error('[fresh-release] baseline validation failed:');
			for (const issue of issues) console.error(`- ${issue}`);
			return 1;
		}
		console.log('[fresh-release] tracked content starts at the public baseline');
		return 0;
	} catch (err) {
		console.error(`Error: ${errorMessage(err)}`);
		return 2;
	}
}

if (import.meta.main) exit(await main());

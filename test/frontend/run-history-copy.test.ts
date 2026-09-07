import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { RUN_HISTORY_COPY_TEST_INPUTS } from '../../scripts/lib/smoke-cache/dependencies.ts';

const confusingHistoryTerms = [
	'web-managed',
	'web managed',
	'project-local',
	'local ledger',
	'separate from web-managed',
	'last web run',
	'web run:',
];

describe('run history copy', () => {
	test('does not expose confusing web-managed or project-local history terms', async () => {
		const violations: string[] = [];
		for (const file of RUN_HISTORY_COPY_TEST_INPUTS) {
			let content: string;
			try {
				content = await readFile(join(process.cwd(), file), 'utf8');
			} catch (err) {
				// Some checked files (e.g. the maintainer's own .aidd/ docs) are gitignored and
				// absent in a fresh clone; skip what isn't present rather than failing the suite.
				if ((err as { code?: string }).code === 'ENOENT') continue;
				throw err;
			}
			const normalized = content.toLowerCase();
			for (const term of confusingHistoryTerms) {
				if (normalized.includes(term)) violations.push(`${file}: ${term}`);
			}
		}

		expect(violations).toEqual([]);
	});
});

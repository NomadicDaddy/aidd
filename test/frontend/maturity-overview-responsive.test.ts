import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('project maturity overview responsive layout', () => {
	test('keeps the ring and stage list stacked until the xl content breakpoint', async () => {
		const source = await readFile(
			join(
				process.cwd(),
				'frontend',
				'src',
				'pages',
				'projects',
				'detail',
				'MaturityOverview.tsx',
			),
			'utf8',
		);

		expect(source).toContain('flex flex-wrap items-start gap-4 xl:flex-nowrap');
		expect(source).toContain('flex shrink-0 flex-col items-center gap-3 max-xl:w-full');
		expect(source).toContain('min-w-0 space-y-2 max-xl:w-full xl:flex-1');
		expect(source).not.toMatch(/\bmd:(?:flex-1|flex-nowrap)\b/);
	});
});

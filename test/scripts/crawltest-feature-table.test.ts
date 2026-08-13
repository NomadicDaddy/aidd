import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const featureTableSource = readFileSync(
	resolve(import.meta.dir, '../../scripts/lib/crawltest/feature-table.ts'),
	'utf8',
);
const filterToolbarSource = readFileSync(
	resolve(import.meta.dir, '../../frontend/src/components/shared/FilterToolbar.tsx'),
	'utf8',
);

describe('crawltest project feature filters', () => {
	test('finds labelled selects nested by the responsive filter toolbar', () => {
		expect(filterToolbarSource).toContain("'hidden sm:contents'");
		expect(featureTableSource).toContain("grid.querySelectorAll('label')");
		expect(featureTableSource).toContain("field.querySelector(':scope > span')");
		expect(featureTableSource).not.toContain('Array.from(grid.children).find');
	});
});

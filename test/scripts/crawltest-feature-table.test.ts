import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { filterValueForLabel } from '../../scripts/lib/crawltest/feature-table.ts';

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

	test('maps human-readable row labels back to raw filter values', () => {
		const options = [
			{ label: 'Waiting approval', value: 'waiting_approval' },
			{ label: 'Audit: Complication', value: 'Audit: COMPLICATION' },
		];

		expect(filterValueForLabel(options, 'Waiting approval')).toBe('waiting_approval');
		expect(filterValueForLabel(options, 'Audit: Complication')).toBe('Audit: COMPLICATION');
		expect(filterValueForLabel(options, 'Missing')).toBe('');
		expect(featureTableSource).toContain("label: option.textContent?.trim() ?? ''");
	});
});

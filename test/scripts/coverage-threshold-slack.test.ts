import { expect, test } from 'bun:test';

import { COVERAGE_AREAS, type CoverageArea } from '../../scripts/lib/test-coverage/contracts.ts';
import { buildCoverageReport } from '../../scripts/lib/test-coverage/report.ts';

function reportAt(threshold: number) {
	const area: CoverageArea = {
		id: 'scripts',
		prefix: 'scripts/',
		thresholds: { functions: threshold, lines: threshold, modules: threshold },
	};
	const inventory = Array.from({ length: 10 }, (_, index) => `scripts/example-${index}.ts`);
	const covered = new Map(
		inventory.slice(0, 9).map((path) => [
			path,
			{
				functions: { covered: 9, total: 10 },
				lines: { covered: 9, total: 10 },
				path,
			},
		]),
	);
	return buildCoverageReport(inventory, covered, [area]);
}

test('coverage reports stale floors without turning the warning into a failure', () => {
	const loose = reportAt(50);
	expect(loose.areas[0]?.slack).toHaveLength(3);
	expect(loose.passed).toBe(true);
	expect(reportAt(85).areas[0]?.slack).toEqual([]);
});

test('coverage inventory retains every production area', () => {
	expect(COVERAGE_AREAS.map((area) => area.id)).toEqual([
		'backend',
		'cli',
		'frontend',
		'scripts',
		'shared',
	]);
});

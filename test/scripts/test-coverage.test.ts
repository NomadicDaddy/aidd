import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import {
	isProductionSourcePath,
	type FileCoverageMetrics,
} from '../../scripts/lib/test-coverage/contracts.ts';
import { parseProductionLcov } from '../../scripts/lib/test-coverage/lcov.ts';
import { buildCoverageReport, coveragePercent } from '../../scripts/lib/test-coverage/report.ts';

describe('production test coverage', () => {
	test('recognizes production areas without counting tests or declarations', () => {
		expect(isProductionSourcePath('backend/src/server.ts')).toBe(true);
		expect(isProductionSourcePath('frontend/src/App.tsx')).toBe(true);
		expect(isProductionSourcePath('test/backend/server.test.ts')).toBe(false);
		expect(isProductionSourcePath('backend/src/server.test.ts')).toBe(false);
		expect(isProductionSourcePath('shared/src/contracts.d.ts')).toBe(false);
	});

	test('parses only production LCOV line and function records', () => {
		const root = resolve('coverage-fixture');
		const lcov = [
			'TN:',
			'SF:backend\\src\\server.ts',
			'FNF:4',
			'FNH:3',
			'LF:10',
			'LH:8',
			'end_of_record',
			'TN:',
			'SF:test\\backend\\server.test.ts',
			'FNF:1',
			'FNH:1',
			'LF:2',
			'LH:2',
			'end_of_record',
		].join('\n');

		expect([...parseProductionLcov(root, lcov).values()]).toEqual([
			{
				functions: { covered: 3, total: 4 },
				lines: { covered: 8, total: 10 },
				path: 'backend/src/server.ts',
			},
		]);
	});

	test('reports module representation separately from loaded-code percentages', () => {
		const backendFile: FileCoverageMetrics = {
			functions: { covered: 3, total: 4 },
			lines: { covered: 8, total: 10 },
			path: 'backend/src/server.ts',
		};
		const report = buildCoverageReport(
			['backend/src/server.ts', 'backend/src/unloaded.ts'],
			new Map([[backendFile.path, backendFile]])
		);
		const backend = report.areas.find((area) => area.id === 'backend');

		expect(coveragePercent(backend?.modules ?? { covered: 0, total: 0 })).toBe(50);
		expect(coveragePercent(backend?.lines ?? { covered: 0, total: 0 })).toBe(80);
		expect(report.branchCoverage.available).toBe(false);
		expect(report.passed).toBe(false);
		expect(backend?.failures).toContain('lines 80.0% is below 81.0%');
	});

	test('configures Bun to exclude test files from coverage', async () => {
		const bunfig = await Bun.file('bunfig.toml').text();

		expect(bunfig).toContain('coverageSkipTestFiles = true');
	});
});

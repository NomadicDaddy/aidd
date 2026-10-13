import { describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FileCoverageMetrics } from '../../scripts/lib/test-coverage/contracts.ts';

import { LOCK_FILE, readLock } from '../../scripts/lib/shared-core/lock.ts';
import { deliveredPaths } from '../../scripts/lib/test-coverage/delivered.ts';
import {
	buildCoverageReport,
	coveragePercent,
	withoutDelivered,
} from '../../scripts/lib/test-coverage/report.ts';
import { testTempDirSync } from '../_helpers/temp.ts';

// Delivered files are written here by their owner and tested where they are owned, so they are not
// counted as this repository's code. When they were, ten newly delivered files dropped the scripts
// area under its floor with every test passing, and a test that loaded them to bring the module
// count back took the line count down instead. These hold the exclusion to what it claims: it is
// read from the lock, it removes a file from both sides of the count, and it removes nothing else.

const REPO_ROOT = join(import.meta.dir, '..', '..');
const HASH = 'a'.repeat(64);

function metrics(path: string, covered: number, total: number): FileCoverageMetrics {
	return { functions: { covered, total }, lines: { covered, total }, path };
}

describe('files delivered to this repository are not counted as its own code', () => {
	test('the list is every path the lock records, across groups, and nothing when there is no lock', () => {
		const root = testTempDirSync('coverage-delivered-');
		expect(deliveredPaths(root)).toEqual(new Set());

		const lock = {
			commit: 'b'.repeat(40),
			groups: {
				declared: {},
				gates: { files: { 'scripts/check-a.ts': { mode: '100644', sha256: HASH } } },
				hooks: {
					files: {
						'.githooks/guard.sh': { mode: '100644', sha256: HASH },
						'.githooks/pre-commit': { claim: 'local-chain' },
					},
				},
			},
			owner: 'smokestack',
			version: '1.0.0',
		};
		writeFileSync(join(root, LOCK_FILE), JSON.stringify(lock));
		expect(deliveredPaths(root)).toEqual(
			new Set(['.githooks/guard.sh', '.githooks/pre-commit', 'scripts/check-a.ts']),
		);
	});

	test('a lock that cannot be read is an error here, not an empty list', () => {
		const root = testTempDirSync('coverage-delivered-bad-');
		writeFileSync(join(root, LOCK_FILE), '{ not json');
		expect(() => deliveredPaths(root)).toThrow();
	});

	test('a delivered file leaves both the module count and the measured lines', () => {
		const inventory = ['scripts/own.ts', 'scripts/own-unloaded.ts', 'scripts/check-a.ts'];
		const measured = new Map([
			// Loaded by a test and barely run: the record that dragged the area's lines down.
			['scripts/check-a.ts', metrics('scripts/check-a.ts', 1, 100)],
			['scripts/own.ts', metrics('scripts/own.ts', 8, 10)],
		]);
		const delivered = new Set(['scripts/check-a.ts']);

		const counted = buildCoverageReport(inventory, measured).areas.find(
			(area) => area.id === 'scripts',
		);
		expect(coveragePercent(counted?.lines ?? { covered: 0, total: 0 })).toBeCloseTo(8.18, 1);

		const own = withoutDelivered(inventory, measured, delivered);
		expect(own.inventory).toEqual(['scripts/own.ts', 'scripts/own-unloaded.ts']);
		const scripts = buildCoverageReport(own.inventory, own.lcovFiles).areas.find(
			(area) => area.id === 'scripts',
		);
		expect(scripts?.modules).toEqual({ covered: 1, total: 2 });
		expect(scripts?.lines).toEqual({ covered: 8, total: 10 });
		expect(scripts?.functions).toEqual({ covered: 8, total: 10 });
	});

	test('nothing that is not in the list is left out', () => {
		const inventory = ['scripts/own.ts', 'backend/src/server.ts'];
		const measured = new Map([['scripts/own.ts', metrics('scripts/own.ts', 1, 2)]]);
		const own = withoutDelivered(inventory, measured, new Set(['scripts/elsewhere.ts']));
		expect(own.inventory).toEqual(inventory);
		expect([...own.lcovFiles.keys()]).toEqual(['scripts/own.ts']);
	});

	test("this repository's own lock names delivered scripts, and only real ones", () => {
		// The exclusion is keyed on the lock, so it is worth one look at the real thing: it exists,
		// it records a delivery, and what it would leave out is the delivered sync and gates, not
		// an arbitrary path somebody added. The shared-files check holds the entries exact.
		const delivered = deliveredPaths(REPO_ROOT);
		expect(readLock(REPO_ROOT)?.version).toBeDefined();
		expect(delivered.has('scripts/sync-shared-core.ts')).toBe(true);
		expect(delivered.has('scripts/lib/shared-core/lock.ts')).toBe(true);
		expect(delivered.has('scripts/run-test-coverage.ts')).toBe(false);
		expect(delivered.has('scripts/lib/test-coverage/delivered.ts')).toBe(false);
	});
});

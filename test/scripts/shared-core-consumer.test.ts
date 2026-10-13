import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { LOCK_FILE, readLock } from '../../scripts/lib/shared-core/lock.ts';
import { runSharedCoreFrom } from '../_helpers/shared-core-run.ts';

// aidd carries the shared-core sync and owns none of it. The tool's own tests live with its owner;
// what belongs here is the one thing only this repository can say: that the copy delivered to it
// works FROM it. When the owner took the tool's tests with it, nothing in aidd loaded the delivered
// modules any more, and a delivery that added ten of them was the first sign: the files arrived,
// the gate step that runs them passed, and no test here would have noticed if they had not run.
//
// So these run the delivered entry point in this repository, in process: it has to check this tree
// against this tree's own lock and nothing else, and it has to refuse everything that belongs to
// the owner. What happens when the tree does NOT match is in shared-core-consumer-copy.test.ts,
// which works on a copy so that nothing here is ever altered.

const REPO_ROOT = join(import.meta.dir, '..', '..');

function run(...args: string[]): { code: number; out: string } {
	return runSharedCoreFrom(REPO_ROOT, ...args);
}

describe('the delivered sync, run from this repository', () => {
	test('this repository keeps a lock that records a delivery', () => {
		expect(existsSync(join(REPO_ROOT, LOCK_FILE))).toBe(true);
		const lock = readLock(REPO_ROOT);
		expect(lock?.version).toMatch(/^\d+\.\d+\.\d+$/u);
		// The tool's own group is among what was delivered, or nothing here could check anything.
		expect(Object.keys(lock?.groups['shared-core-sync'] ?? {}).length).toBeGreaterThan(0);
	});

	test('--check holds this tree to its own lock, passes, and sweeps nothing else', () => {
		const { code, out } = run('--check');
		expect(out).toMatch(/\[OK\] Shared core: \d+ file\(s\) in \d+ group\(s\) match/u);
		// It is a repository checking itself, not the owner's sweep of the fleet.
		expect(out).not.toContain('Roots: scanned');
		expect(code).toBe(0);
	});

	test('the owner flags are refused here, not ignored', () => {
		for (const args of [
			['--check', '--only', 'somewhere'],
			['--check', '--group', 'license-core'],
			['--check', '--fleet-root', REPO_ROOT],
		]) {
			const { code, out } = run(...args);
			expect(out).toContain('this repository owns no group');
			expect(code).toBe(2);
		}
	});

	test('a write from here is refused: this repository delivers nothing', () => {
		const { code, out } = run('--write');
		expect(out).toContain('--write cannot be used here');
		expect(code).toBe(2);
	});
});

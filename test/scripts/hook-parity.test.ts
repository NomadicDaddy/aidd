import { describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { findHookParityProblems } from '../../scripts/check-hook-parity.ts';
import { GUARD_ONLY_FILES, GUARD_ONLY_SOURCE } from '../../scripts/lib/leak-guard/contract.ts';
import { GUARDS, HOOK } from '../../scripts/lib/push-guards/contract.ts';
import { testTempDirSync } from '../_helpers/temp.ts';

// The checker's whole value is that it fails on drift, and a green run against the real .githooks/
// proves only the happy path. Every branch below is driven against synthetic directories.

const INSTALLED = [HOOK, ...GUARDS, GUARD_ONLY_SOURCE, ...GUARD_ONLY_FILES];

/** A pair of hook directories, both carrying every installed file, before a case perturbs one. */
function hookDirs(): { owner: string; scaffold: string } {
	const root = testTempDirSync('hook-parity-');
	const owner = join(root, '.githooks');
	const scaffold = join(root, 'scaffolding', '.githooks');
	mkdirSync(owner, { recursive: true });
	mkdirSync(scaffold, { recursive: true });
	for (const name of INSTALLED) {
		writeFileSync(join(owner, name), `# ${name}\n`);
		writeFileSync(join(scaffold, name), `# ${name}\n`);
	}
	return { owner, scaffold };
}

describe('hook parity checker', () => {
	test('matching directories report nothing', () => {
		const { owner, scaffold } = hookDirs();
		expect(findHookParityProblems(owner, scaffold)).toEqual([]);
	});

	test('a fix applied to .githooks alone fails — the screenshot-guard regression', () => {
		// On 2026-08-03 a screenshot-guard.sh fix landed in .githooks/ only. ensureHistoryGuard then
		// copied the stale scaffold copy back over the fixed one and staged the revert. This is that
		// exact drift, reproduced.
		const { owner, scaffold } = hookDirs();
		writeFileSync(join(owner, 'screenshot-guard.sh'), '# screenshot-guard.sh\n# the fix\n');
		const problems = findHookParityProblems(owner, scaffold);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('screenshot-guard.sh');
		expect(problems[0]).toContain('differs from');
	});

	test('a guard the hooks source but the scaffold omits fails', () => {
		// The scaffold ships the hook without the guard it chains: under `set -euo pipefail` that is
		// not a degraded guard, it is a hook that fails every run.
		const { owner, scaffold } = hookDirs();
		rmSync(join(scaffold, GUARDS[0]!));
		const problems = findHookParityProblems(owner, scaffold);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain(GUARDS[0]!);
		expect(problems[0]).toContain('ensureHistoryGuard installs it');
	});

	test('a scaffold file with no owner fails, since no sync would ever correct it', () => {
		const { owner, scaffold } = hookDirs();
		writeFileSync(join(scaffold, 'orphan-guard.sh'), '# nobody owns this\n');
		const problems = findHookParityProblems(owner, scaffold);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('has no counterpart in .githooks/');
	});

	test('an owner-only file is allowed — the subset is one-directional', () => {
		// The full pre-commit names tasks a scaffolded package.json does not define, and
		// leak-guard-setup.sh is invoked from a `prepare` key it does not have. Neither may be
		// scaffolded, so their absence from the scaffold must not be a finding.
		const { owner, scaffold } = hookDirs();
		writeFileSync(join(owner, 'leak-guard-setup.sh'), '# owner only\n');
		expect(findHookParityProblems(owner, scaffold)).toEqual([]);
	});

	test('a missing scaffold directory fails rather than passing vacuously', () => {
		const { owner } = hookDirs();
		const problems = findHookParityProblems(owner, join(owner, '..', 'nope'));
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('ships no hooks at all');
	});
});

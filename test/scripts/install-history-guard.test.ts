import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { AIDD_ROOT, GUARDS, HOOK, MARKER } from '../../scripts/lib/push-guards/contract.ts';

// The installer copies a hook outward and, separately, a list of guard files. Nothing links the
// two: the hook is shell, the list is TypeScript, and a change to one compiles and passes review
// without the other. That gap has already been exercised once. `feat(release): require screenshot
// artifacts for tags` taught .githooks/pre-push to call screenshot-guard.sh and did not touch the
// installer, so every repository the installer touched afterwards received a hook invoking a file
// that was never delivered. The hook runs under `set -euo pipefail`, so the result is not a guard
// that skips a check — it is a repository whose every push fails.
//
// These tests read the actual hook body rather than restating it, because a restatement is one
// more copy to keep in sync and would drift the same way.
const HOOKS_DIR = join(AIDD_ROOT, '.githooks');
const hookBody = readFileSync(join(HOOKS_DIR, HOOK), 'utf8');

/**
 * Every guard the hook invokes, read out of the hook itself.
 *
 * The hook calls them as `bash "$hooks_dir/<name>.sh"`, so the sibling-path form is the signal —
 * it is what distinguishes a guard the installer must deliver from an ordinary command. A guard
 * referenced any other way would not be found here, which is deliberate: the installer can only
 * promise to carry files the hook resolves relative to itself.
 */
const referencedGuards = [...hookBody.matchAll(/\$hooks_dir\/([A-Za-z0-9._-]+\.sh)/g)].map(
	(m) => m[1]!,
);

describe('install-history-guard contract', () => {
	test('the hook chains at least one guard', () => {
		// Guards against the regex silently matching nothing after a hook rewrite, which would make
		// every assertion below vacuously true.
		expect(referencedGuards.length).toBeGreaterThan(0);
	});

	test('every guard the hook invokes is one the installer carries', () => {
		const missing = referencedGuards.filter((g) => !GUARDS.includes(g));
		expect(missing).toEqual([]);
	});

	test('every guard the installer carries exists to be copied', () => {
		const absent = GUARDS.filter((g) => !existsSync(join(HOOKS_DIR, g)));
		expect(absent).toEqual([]);
	});

	test('the installer carries no guard the hook never invokes', () => {
		// Not cosmetic: an unreferenced guard is dead weight the installer stages into every
		// repository in the fleet, and its presence reads as coverage that nothing actually runs.
		const orphans = GUARDS.filter((g) => !referencedGuards.includes(g));
		expect(orphans).toEqual([]);
	});

	test('the marker the installer recognises is present in the hook it installs', () => {
		// If these drift apart the installer stops recognising its own hook and refuses every
		// repository it previously installed into, reporting them all as foreign.
		expect(hookBody).toContain(MARKER);
	});

	test('the hook replays stdin into each guard rather than letting one consume it', () => {
		// git delivers the ref updates on stdin exactly once. A second guard reading it directly
		// gets nothing, checks nothing, and exits 0 — a guard that passes because it was starved is
		// indistinguishable from one that found no problem.
		if (referencedGuards.length < 2) return;
		for (const guard of referencedGuards) {
			expect(hookBody).toMatch(
				new RegExp(`\\|\\s*bash "\\$hooks_dir/${guard.replace('.', '\\.')}`),
			);
		}
	});
});

describe('install-history-guard sources', () => {
	test('the installer reads its file list from the contract, not a local literal', () => {
		// The whole point of the contract module is that the list has one home. A literal copy here
		// would reintroduce exactly the drift these tests exist to catch.
		const installer = readFileSync(
			resolve(AIDD_ROOT, 'scripts', 'install-history-guard.ts'),
			'utf8',
		);
		expect(installer).toContain("from './lib/push-guards/contract.ts'");
		for (const guard of GUARDS) expect(installer).not.toContain(`'${guard}'`);
	});
});

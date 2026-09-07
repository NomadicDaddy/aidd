import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { describe, expect, test } from 'bun:test';

import type { SharedCoreGroup } from '../../scripts/lib/shared-core/manifest.ts';

import { checkGroup, isFatal } from '../../scripts/lib/shared-core/check.ts';
import {
	chainedByHook,
	dispatcherBody,
	hooksPath,
	invokes,
} from '../../scripts/lib/shared-core/dispatch.ts';
import { loadManifest } from '../../scripts/lib/shared-core/manifest.ts';
import { readScripts, resolveTargets } from '../../scripts/lib/shared-core/targets.ts';
import {
	applyFindings,
	ownershipRefusal,
	repoIdentity,
} from '../../scripts/lib/shared-core/write.ts';

import { testTempDirSync } from '../_helpers/temp.ts';

// scripts/sync-shared-core.ts is owned by spernakit, which drives the same classifier and writer
// through a synthetic fleet in scripts/test-shared-core-write.ts. That test cannot run here: it
// needs lib/shared-core-write/fixture.ts, which is not part of the synced group. What follows is
// the half aidd can hold on its own — the loader's refusals, target resolution, the dispatch
// primitives, and one end-to-end pass over a scratch fleet.

/** A group with no hook, so classification turns only on file content. */
const GUARDS: SharedCoreGroup = {
	files: [
		{ disposition: 'synced', source: 'guard.sh' },
		{ disposition: 'seeded', source: 'seed.txt' },
	],
	name: 'guards',
	owner: 'owner-repo',
	sourceRoot: '.githooks',
	targetRoot: '.githooks',
	targets: { model: 'roster', roster: 'roster.json' },
};

/**
 * The same group under a real owner. GUARDS deliberately names one that is not canon, so the loader
 * rejects it at the owner rule and never reaches the rule under test.
 */
const LOADABLE: SharedCoreGroup = { ...GUARDS, owner: 'spernakit' };

function put(root: string, relative: string, body: string): void {
	const path = join(root, relative);
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, body);
}

function gitInit(root: string): void {
	Bun.spawnSync(['git', 'init', '-q', root], { windowsHide: true });
}

/**
 * A committed target, which is the only state the writer will overwrite. An untracked file reads as
 * uncommitted work — correctly — so a fixture that only ran `git init` would prove the refusal and
 * never the write.
 */
function gitCommitAll(root: string): void {
	gitInit(root);
	Bun.spawnSync(['git', '-C', root, 'add', '-A'], { windowsHide: true });
	const identity = ['-c', 'user.email=test@example.invalid', '-c', 'user.name=Test'];
	Bun.spawnSync(['git', '-C', root, ...identity, 'commit', '-q', '-m', 'fixture'], {
		windowsHide: true,
	});
}

/**
 * owner-repo holds guard v2; `current` matches it, `drifted` has an older guard and a locally
 * edited seed, and `absent` has nothing at all. Returns the fleet root.
 */
function scratchFleet(): string {
	const fleet = testTempDirSync('aidd-shared-core-');
	const owner = join(fleet, 'owner-repo');
	put(owner, 'package.json', JSON.stringify({ name: 'owner-repo' }));
	put(owner, 'roster.json', JSON.stringify(['current', 'drifted', 'absent']));
	put(owner, '.githooks/guard.sh', 'guard v2\n');
	put(owner, '.githooks/seed.txt', 'seed\n');

	put(join(fleet, 'current'), '.githooks/guard.sh', 'guard v2\n');
	put(join(fleet, 'current'), '.githooks/seed.txt', 'seed\n');
	put(join(fleet, 'drifted'), '.githooks/guard.sh', 'guard v1\n');
	put(join(fleet, 'drifted'), '.githooks/seed.txt', 'seed edited locally\n');
	mkdirSync(join(fleet, 'absent'), { recursive: true });
	return fleet;
}

function manifestDir(groups: unknown): string {
	const dir = testTempDirSync('aidd-shared-core-manifest-');
	writeFileSync(join(dir, 'shared-core-manifest.json'), JSON.stringify({ groups }));
	return dir;
}

describe('shared core manifest loader', () => {
	test("this repository's own manifest loads and every group names an owner", () => {
		const groups = loadManifest(join(cwd(), 'scripts'));
		expect(groups.length).toBeGreaterThan(0);
		for (const group of groups) {
			expect(['aidd', 'spernakit']).toContain(group.owner);
			expect(group.files.length).toBeGreaterThan(0);
		}
		expect(groups.map((group) => group.name)).toContain('shared-core-sync');
	});

	test('an absent or shapeless manifest is an error rather than an empty fleet', () => {
		const empty = testTempDirSync('aidd-shared-core-none-');
		expect(() => loadManifest(empty)).toThrow('not found at');
		expect(() => loadManifest(manifestDir([]))).toThrow('non-empty "groups" array');
	});

	test('an owner outside the two canon repositories is rejected', () => {
		const dir = manifestDir([{ ...GUARDS, owner: 'some-app' }]);
		expect(() => loadManifest(dir)).toThrow('owner must be one of');
	});

	test('a hook must be one of the files the group carries', () => {
		const dir = manifestDir([{ ...LOADABLE, hook: 'pre-push' }]);
		expect(() => loadManifest(dir)).toThrow("hook 'pre-push' is not among the files");
	});

	test('a fallback variant and its predicate must be declared together', () => {
		const dir = manifestDir([
			{
				...LOADABLE,
				files: [{ disposition: 'synced', requiresScripts: ['lint'], source: 'a' }],
			},
		]);
		expect(() => loadManifest(dir)).toThrow('requiresScripts and fallbackSource together');
	});

	test('wiring without requiresPackageJson is rejected', () => {
		const dir = manifestDir([{ ...LOADABLE, wiring: { 'check:x': 'bun x' } }]);
		expect(() => loadManifest(dir)).toThrow('declares wiring but not requiresPackageJson');
	});

	test('an empty wiring value is rejected, because it matches every script', () => {
		const dir = manifestDir([
			{ ...LOADABLE, requiresPackageJson: true, wiring: { 'check:x': '' } },
		]);
		expect(() => loadManifest(dir)).toThrow('wiring check:x must be a non-empty string');
	});

	test('two groups may not share a name or a destination', () => {
		expect(() => loadManifest(manifestDir([LOADABLE, LOADABLE]))).toThrow(
			"two groups are named 'guards'",
		);
		const collide = manifestDir([LOADABLE, { ...LOADABLE, name: 'other' }]);
		expect(() => loadManifest(collide)).toThrow('both write .githooks/guard.sh');
	});
});

describe('shared core target resolution', () => {
	test('an absent roster resolves to no targets rather than throwing', () => {
		const fleet = testTempDirSync('aidd-shared-core-roster-');
		expect(resolveTargets(GUARDS, fleet, join(fleet, 'owner-repo'))).toEqual([]);
	});

	test('a roster accepts a bare name or a name with a pinned package', () => {
		const fleet = testTempDirSync('aidd-shared-core-roster-');
		const owner = join(fleet, 'owner-repo');
		put(
			owner,
			'roster.json',
			JSON.stringify(['one', { directory: 'two', packageName: '@s/t' }]),
		);
		expect(resolveTargets(GUARDS, fleet, owner)).toEqual([
			{ directory: 'one', packageName: 'one', path: join(fleet, 'one') },
			{ directory: 'two', packageName: '@s/t', path: join(fleet, 'two') },
		]);
	});

	test('a roster entry that is a path rather than one sibling name is rejected', () => {
		const fleet = testTempDirSync('aidd-shared-core-roster-');
		const owner = join(fleet, 'owner-repo');
		put(owner, 'roster.json', JSON.stringify(['../elsewhere']));
		expect(() => resolveTargets(GUARDS, fleet, owner)).toThrow('one sibling directory name');
	});

	test('discovery takes every git repository the marker selects, never the owner itself', () => {
		const fleet = testTempDirSync('aidd-shared-core-discovered-');
		for (const name of ['owner-repo', 'marked', 'unmarked', 'not-a-repo']) {
			mkdirSync(join(fleet, name), { recursive: true });
			if (name !== 'not-a-repo') mkdirSync(join(fleet, name, '.git'), { recursive: true });
		}
		mkdirSync(join(fleet, 'marked', '.aidd'), { recursive: true });
		mkdirSync(join(fleet, 'owner-repo', '.aidd'), { recursive: true });
		const marked = { ...GUARDS, targets: { marker: '.aidd', model: 'discovered' } } as const;
		expect(resolveTargets(marked, fleet, join(fleet, 'owner-repo')).map((t) => t.directory)) //
			.toEqual(['marked']);
	});

	test('a repository with no package.json reads as no scripts, not as an empty object', () => {
		const fleet = testTempDirSync('aidd-shared-core-scripts-');
		expect(readScripts(fleet)).toBeNull();
		put(fleet, 'package.json', JSON.stringify({ scripts: { lint: 'eslint .' } }));
		expect(readScripts(fleet)).toEqual({ lint: 'eslint .' });
		writeFileSync(join(fleet, 'package.json'), '{ not json');
		expect(readScripts(fleet)).toBeNull();
	});
});

describe('shared core dispatch', () => {
	test('a guard is invoked only when the body names it at a path boundary', () => {
		expect(invokes('bash .githooks/leak-guard.sh "$@"', 'leak-guard.sh')).toBe(true);
		expect(invokes('bash .githooks/leak-guard.sh "$@"', 'guard.sh')).toBe(false);
		expect(invokes('bash .githooks/leak-guard-setup.sh', 'leak-guard.sh')).toBe(false);
	});

	test('the guards a hook chains are read out of the hook, never declared beside it', () => {
		const fleet = testTempDirSync('aidd-shared-core-chain-');
		const owner = join(fleet, 'owner-repo');
		put(owner, '.githooks/pre-push', '#!/bin/sh\nbash .githooks/guard.sh\n');
		put(owner, '.githooks/guard.sh', 'guard v2\n');
		put(owner, '.githooks/seed.txt', 'seed\n');
		const hooked: SharedCoreGroup = {
			...GUARDS,
			files: [{ disposition: 'synced', source: 'pre-push' }, ...GUARDS.files],
			hook: 'pre-push',
		};
		expect([...chainedByHook(hooked, owner)]).toEqual(['guard.sh']);
		expect(chainedByHook(GUARDS, owner).size).toBe(0);
	});

	test('an unset core.hooksPath means .git/hooks, which is where a foreign tool writes', () => {
		const repo = testTempDirSync('aidd-shared-core-hooks-');
		gitInit(repo);
		expect(hooksPath(repo)).toBe('');
		expect(dispatcherBody(repo, '', 'pre-commit')).toBeNull();
		put(repo, '.git/hooks/pre-commit', '#!/bin/sh\n# husky\n');
		expect(dispatcherBody(repo, '', 'pre-commit')).toContain('husky');
	});
});

describe('shared core check and write', () => {
	test('absent, drifted and current are three outcomes, and only drift is fatal', () => {
		const fleet = scratchFleet();
		const report = checkGroup(GUARDS, fleet, join(fleet, 'owner-repo'));

		expect(report.targets).toBe(3);
		expect(report.matched).toBe(3); // current's two files, plus drifted's seeded one
		const kinds = report.findings.map((finding) => `${finding.target}:${finding.kind}`).sort();
		expect(kinds).toEqual([
			'absent:uncovered',
			'absent:uncovered',
			'drifted:drift',
			//
		]);
		expect(report.findings.filter(isFatal)).toHaveLength(1);
	});

	test('a source the manifest names but the owner does not have is refused outright', () => {
		const fleet = scratchFleet();
		const group: SharedCoreGroup = {
			...GUARDS,
			files: [{ disposition: 'synced', source: 'never-written.sh' }],
		};
		expect(() => checkGroup(group, fleet, join(fleet, 'owner-repo'))).toThrow(
			'reports coverage it does not have',
		);
	});

	test('a dry run exercises every refusal, writes nothing, and predicts the real write', () => {
		const fleet = scratchFleet();
		gitCommitAll(join(fleet, 'drifted'));
		gitInit(join(fleet, 'absent'));
		const findings = checkGroup(GUARDS, fleet, join(fleet, 'owner-repo')).findings;

		const dry = applyFindings(findings, fleet, true);
		expect(dry.written).toHaveLength(3);
		expect(readFileSync(join(fleet, 'drifted', '.githooks', 'guard.sh'), 'utf8')).toBe(
			'guard v1\n',
		);

		const real = applyFindings(findings, fleet, false);
		expect(real.written).toHaveLength(dry.written.length);
		expect(readFileSync(join(fleet, 'drifted', '.githooks', 'guard.sh'), 'utf8')).toBe(
			'guard v2\n',
		);
		expect(readFileSync(join(fleet, 'absent', '.githooks', 'seed.txt'), 'utf8')).toBe('seed\n');
		// The seeded file diverged before the run and is still the target's own afterwards.
		expect(readFileSync(join(fleet, 'drifted', '.githooks', 'seed.txt'), 'utf8')).toBe(
			'seed edited locally\n',
		);

		const after = checkGroup(GUARDS, fleet, join(fleet, 'owner-repo'));
		expect(after.findings).toEqual([]);
	});

	test('a target git cannot vouch for is refused, not written', () => {
		const fleet = scratchFleet();
		const findings = checkGroup(GUARDS, fleet, join(fleet, 'owner-repo')).findings;
		const outcome = applyFindings(findings, fleet, false);

		expect(outcome.written).toHaveLength(0);
		expect(outcome.blocked).toHaveLength(3);
		expect(existsSync(join(fleet, 'absent', '.githooks', 'guard.sh'))).toBe(false);
	});

	test('a group is writable only from the repository that owns it', () => {
		const fleet = scratchFleet();
		expect(repoIdentity(join(fleet, 'owner-repo'))).toBe('owner-repo');
		expect(ownershipRefusal(GUARDS, join(fleet, 'owner-repo'))).toBeNull();
		expect(ownershipRefusal(GUARDS, join(fleet, 'current'))).toContain('cannot identify');
		put(join(fleet, 'current'), 'package.json', JSON.stringify({ name: 'current' }));
		expect(ownershipRefusal(GUARDS, join(fleet, 'current'))).toBe(
			'owned by owner-repo, and this is current',
		);
	});
});

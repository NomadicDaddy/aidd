import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CommandOutput } from '../../scripts/lib/advisory-audit/audit.ts';

import {
	auditTree,
	dependentsOf,
	lockedVersion,
	parseAuditJson,
	storeMismatches,
} from '../../scripts/lib/advisory-audit/audit.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

const LOCK = [
	'{',
	'  "lockfileVersion": 1,',
	'  "packages": {',
	'    "postcss": ["postcss@8.5.28", "", { "dependencies": { "nanoid": "^3.3.18", "source-map-js": "^1.2.1" } }, "sha512-a"],',
	'    "knip": ["knip@6.38.0", "", { "dependencies": { "smol-toml": "^1.8.0" } }, "sha512-b"],',
	'    "smol-toml": ["smol-toml@1.9.0", "", {}, "sha512-c"],',
	'    "source-map-js": ["source-map-js@1.2.2", "", {}, "sha512-d"],',
	'    "knip/smol-toml": ["smol-toml@1.8.0", "", {}, "sha512-e"],',
	'    "update-browserslist-db": ["update-browserslist-db@1.2.3", "", { "dependencies": { "escalade": "^3.2.0" }, "peerDependencies": { "browserslist": ">= 4.21.0" } }, "sha512-f"],',
	'    "browserslist": ["browserslist@4.28.6", "", { "dependencies": { "update-browserslist-db": "^1.2.3" } }, "sha512-g"],',
	'    "eslint/minimatch": ["minimatch@5.1.9", "", { "dependencies": { "brace-expansion": "^2.0.1" } }, "sha512-h"],',
	'    "eslint/minimatch/brace-expansion": ["brace-expansion@2.0.2", "", {}, "sha512-i"],',
	'    "brace-expansion": ["brace-expansion@5.0.9", "", {}, "sha512-j"],',
	'  }',
	'}',
].join('\n');

let tree = '';

afterEach(async () => {
	if (tree) await removeTempTree(tree);
});

async function link(dependentDir: string, pkg: string, version: string): Promise<void> {
	const dir = join(dependentDir, 'node_modules', pkg);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, 'package.json'), JSON.stringify({ name: pkg, version }));
}

const output = (stdout: string, exitCode = 0, timedOut = false): CommandOutput => ({
	exitCode,
	stderr: '',
	stdout,
	timedOut,
});

describe('advisory audit: parsing and the store check', () => {
	test('parses bun audit JSON, treating {} as clean and anything else as unparseable', () => {
		const findings = parseAuditJson(
			JSON.stringify({
				'source-map-js': [
					{
						id: 1,
						severity: 'high',
						title: 'event-loop denial of service',
						url: 'https://github.com/advisories/GHSA-68fv-2mgg-jv7q',
						vulnerable_versions: '>=1.0.0 <1.2.2',
					},
				],
			}),
		);
		expect(findings).toEqual([
			{
				ghsa: 'GHSA-68fv-2mgg-jv7q',
				package: 'source-map-js',
				severity: 'high',
				title: 'event-loop denial of service',
				url: 'https://github.com/advisories/GHSA-68fv-2mgg-jv7q',
				vulnerableVersions: '>=1.0.0 <1.2.2',
			},
		]);
		expect(parseAuditJson('{}')).toEqual([]);
		expect(parseAuditJson('error: registry unreachable')).toBeNull();
		expect(parseAuditJson('[]')).toBeNull();
	});

	test('reads locked versions, dependent-scoped overrides and dependents from the lock text', () => {
		expect(lockedVersion(LOCK, 'source-map-js')).toBe('1.2.2');
		expect(lockedVersion(LOCK, 'smol-toml')).toBe('1.9.0');
		expect(lockedVersion(LOCK, 'smol-toml', 'knip')).toBe('1.8.0');
		expect(lockedVersion(LOCK, 'left-pad')).toBeNull();
		expect(dependentsOf(LOCK, 'source-map-js')).toEqual([
			{ key: 'postcss', name: 'postcss', version: '8.5.28' },
		]);
		expect(dependentsOf(LOCK, 'nanoid')).toEqual([
			{ key: 'postcss', name: 'postcss', version: '8.5.28' },
		]);
		expect(dependentsOf(LOCK, 'sha512')).toEqual([]);
		// A peer dependency is not a dependent: nothing links it inside the dependent's tree.
		expect(dependentsOf(LOCK, 'browserslist')).toEqual([]);
		// A nested entry's key is its dependent chain, and its own nested child resolves by that chain.
		expect(dependentsOf(LOCK, 'brace-expansion')).toEqual([
			{ key: 'eslint/minimatch', name: 'minimatch', version: '5.1.9' },
		]);
		expect(lockedVersion(LOCK, 'brace-expansion', 'eslint/minimatch')).toBe('2.0.2');
		expect(lockedVersion(LOCK, 'brace-expansion')).toBe('5.0.9');
	});

	// Both false positives from the first estate run: update-browserslist-db never links its peer
	// browserslist, and minimatch nested under eslint links the 2.x its own lock line names.
	test('a peer dependency and a correctly linked nested override are not LOCK-ONLY', async () => {
		tree = await testTempDir('aidd-advisory-peer-');
		const bun = join(tree, 'node_modules', '.bun');
		await link(join(bun, 'update-browserslist-db@1.2.3'), 'escalade', '3.2.0');
		await link(join(bun, 'minimatch@5.1.9'), 'brace-expansion', '2.0.2');
		expect(storeMismatches(tree, LOCK, ['browserslist', 'brace-expansion'])).toEqual([]);
		await link(join(bun, 'minimatch@5.1.9'), 'brace-expansion', '2.0.1');
		expect(storeMismatches(tree, LOCK, ['brace-expansion'])).toEqual([
			{
				dependent: 'minimatch@5.1.9',
				linked: '2.0.1',
				locked: '2.0.2',
				package: 'brace-expansion',
			},
		]);
	});

	// bun audit reads the lockfile, not node_modules: a lock moved past an advisory without a
	// reinstall audits clean while the dependent still loads the old version (Carl, deeper, 10-06).
	test('a dependent still linking the old version is LOCK-ONLY; a superseded leftover is not consulted', async () => {
		tree = await testTempDir('aidd-advisory-store-');
		const bun = join(tree, 'node_modules', '.bun');
		await link(join(bun, 'postcss@8.5.28'), 'source-map-js', '1.2.1');
		await link(join(bun, 'postcss@8.5.26'), 'source-map-js', '1.2.1');
		await link(join(bun, 'knip@6.38.0'), 'smol-toml', '1.8.0');

		expect(storeMismatches(tree, LOCK, ['source-map-js', 'smol-toml', 'left-pad'])).toEqual([
			{
				dependent: 'postcss@8.5.28',
				linked: '1.2.1',
				locked: '1.2.2',
				package: 'source-map-js',
			},
		]);

		await link(join(bun, 'postcss@8.5.28'), 'source-map-js', '1.2.2');
		expect(storeMismatches(tree, LOCK, ['source-map-js'])).toEqual([]);

		// A direct dependency links at the tree's own node_modules.
		await link(tree, 'smol-toml', '1.8.0');
		expect(storeMismatches(tree, LOCK, ['smol-toml'])).toEqual([
			{ dependent: '(root)', linked: '1.8.0', locked: '1.9.0', package: 'smol-toml' },
		]);
	});

	test('a timeout or unparseable output is UNSWEPT, never clean', async () => {
		tree = await testTempDir('aidd-advisory-unswept-');
		const base = {
			key: 'x',
			owners: ['alice'],
			previousPackages: [],
			timeoutMs: 10,
			treeDir: tree,
		};
		const timedOut = await auditTree({
			...base,
			runner: () => Promise.resolve(output('', 143, true)),
		});
		expect(timedOut.status).toBe('unswept');
		expect(timedOut.error).toContain('timed out');
		const garbage = await auditTree({
			...base,
			runner: () => Promise.resolve(output('error: no lockfile', 1)),
		});
		expect(garbage.status).toBe('unswept');
		expect(garbage.error).toContain('no parseable JSON');
	});

	test('a clean tree with no node_modules is audited, flagged not installed, with no store check', async () => {
		tree = await testTempDir('aidd-advisory-clean-');
		await writeFile(join(tree, 'bun.lock'), LOCK);
		const audit = await auditTree({
			key: 'x',
			owners: [],
			previousPackages: ['source-map-js'],
			runner: () => Promise.resolve(output('{}')),
			timeoutMs: 10,
			treeDir: tree,
		});
		expect(audit).toMatchObject({
			findings: [],
			lockOnly: [],
			notInstalled: true,
			status: 'audited',
		});
	});

	// The previous report named a package the audit no longer does: the lock moved, the store may
	// not have. That package is still checked.
	test('packages named by the previous report are store-checked even when the audit is clean', async () => {
		tree = await testTempDir('aidd-advisory-previous-');
		await writeFile(join(tree, 'bun.lock'), LOCK);
		await link(join(tree, 'node_modules', '.bun', 'postcss@8.5.28'), 'source-map-js', '1.2.1');
		const audit = await auditTree({
			key: 'x',
			owners: [],
			previousPackages: ['source-map-js'],
			runner: () => Promise.resolve(output('{}')),
			timeoutMs: 10,
			treeDir: tree,
		});
		expect(audit.status).toBe('audited');
		expect(audit.lockOnly).toHaveLength(1);
		expect(audit.lockOnly[0]?.package).toBe('source-map-js');
	});
});

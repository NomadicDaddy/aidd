import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	classifyLockfile,
	type DirectoryLister,
	enumerateRoots,
	findLockfiles,
	listDirectory,
	treeKey,
} from '../../scripts/lib/advisory-audit/enumerate.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

let root = '';
// The owner map comes from a file outside the repository; the script supplies it.
const OWNERS = { deeper: ['carl', 'jimmy'], summon: ['morgan'] };

afterEach(async () => {
	if (root) await removeTempTree(root);
});

async function lock(...parts: string[]): Promise<string> {
	const dir = join(root, ...parts);
	await mkdir(dir, { recursive: true });
	const path = join(dir, 'bun.lock');
	await writeFile(path, '{}\n');
	return path;
}

describe('advisory audit enumeration', () => {
	test('finds lockfiles to depth 4, skipping node_modules and .git', async () => {
		root = await testTempDir('aidd-advisory-enumerate-');
		const expected = [
			await lock('aidd'),
			await lock('deeper', 'frontend'),
			await lock('deeper', 'dist', 'windows-release-1', 'x'),
		];
		await lock('aidd', 'node_modules', 'left-pad');
		await lock('aidd', '.git', 'modules', 'x');
		await lock('a', 'b', 'c', 'd', 'e');

		expect(await findLockfiles(root)).toEqual({ lockfiles: expected.sort(), unreadable: [] });
	});

	// Roger (c49e9d33 review): a subtree the walk could not list was silently left out, so a partial
	// discovery read as complete. There is no ACL fixture, so the failure is injected.
	test('a subtree that cannot be listed is returned unreadable, and the rest is still found', async () => {
		root = await testTempDir('aidd-advisory-unreadable-');
		const aidd = await lock('aidd');
		await lock('locked', 'app');
		const denied = join(root, 'locked');
		const list: DirectoryLister = (dir) => {
			if (dir === denied) return Promise.reject(new Error('EACCES'));
			return listDirectory(dir);
		};
		expect(await findLockfiles(root, 4, list)).toEqual({
			lockfiles: [aidd],
			unreadable: [denied],
		});
		const [scanned] = await enumerateRoots([root], 4, {}, list);
		expect(scanned).toMatchObject({ readable: true, unreadable: [denied] });
		expect(scanned?.entries.map((e) => e.lockPath)).toEqual([aidd]);
	});

	test('classifies build outputs, clones and projects, and keeps the root itself a tree', async () => {
		root = await testTempDir('aidd-advisory-classify-');
		const artifact = classifyLockfile(
			join(root, 'deeper', 'dist', 'windows-release-1', 'bun.lock'),
			root,
		);
		expect(artifact.kind).toBe('artifact');
		expect(artifact.owners).toEqual([]);
		expect(artifact.reason).toContain('historical release artifact');
		expect(
			classifyLockfile(join(root, 'x', 'aidd-build-proofs', 'y', 'bun.lock'), root).kind,
		).toBe('artifact');
		expect(classifyLockfile(join(root, 'x', '.tmp-abc', 'bun.lock'), root).kind).toBe(
			'artifact',
		);

		const clone = classifyLockfile(join(root, 'summon-cli-workflow', 'bun.lock'), root, OWNERS);
		expect(clone).toMatchObject({ kind: 'clone', owners: ['morgan'], parentTree: 'summon' });
		expect(classifyLockfile(join(root, 'summon-stream', 'bun.lock'), root).kind).toBe(
			'project',
		);
		expect(classifyLockfile(join(root, 'spernakit-browser', 'bun.lock'), root).kind).toBe(
			'project',
		);

		const project = classifyLockfile(join(root, 'deeper', 'bun.lock'), root, OWNERS);
		expect(project).toMatchObject({
			kind: 'project',
			owners: ['carl', 'jimmy'],
			treeName: 'deeper',
		});
		expect(classifyLockfile(join(root, 'keystrike', 'bun.lock'), root).owners).toEqual([]);

		// D:\infra is a lockfile at its root: the tree is the root.
		const self = classifyLockfile(join(root, 'bun.lock'), root);
		expect(self.treeDir).toBe(root);
		expect(treeKey(self)).toBe(self.treeName);
		expect(treeKey(project)).toBe(`${self.treeName}/deeper`);
	});

	test('a root with no lockfile has no entries, which the report calls no npm surface', async () => {
		root = await testTempDir('aidd-advisory-empty-');
		await mkdir(join(root, 'scripts-only'), { recursive: true });
		const [scanned] = await enumerateRoots([root]);
		expect(scanned?.entries).toEqual([]);
		// With no map at all, every tree is unowned rather than guessed.
		expect(classifyLockfile(join(root, 'orphan', 'bun.lock'), root).owners).toEqual([]);
	});

	test('an unreadable root is reported unreadable, never as no npm surface', async () => {
		root = await testTempDir('aidd-advisory-missing-');
		const [missing, present] = await enumerateRoots([join(root, 'no-such-root'), root]);
		expect(missing).toMatchObject({ entries: [], readable: false });
		expect(present?.readable).toBe(true);
	});

	test('a lockfile of another package manager is listed as foreign, not audited', async () => {
		root = await testTempDir('aidd-advisory-foreign-');
		await mkdir(join(root, 'npm-app'), { recursive: true });
		await writeFile(join(root, 'npm-app', 'package-lock.json'), '{}\n');
		const [scanned] = await enumerateRoots([root]);
		expect(scanned?.entries).toHaveLength(1);
		expect(scanned?.entries[0]).toMatchObject({ kind: 'foreign', owners: [] });
		expect(scanned?.entries[0]?.reason).toContain('package-lock.json');
	});

	// aidd-build-proofs-public holds whole vendored source trees that nobody fixes. A nested
	// workspace lockfile (burrowday/frontend) is a separate resolved dependency set and is audited:
	// the panel's ignoredFolders names `frontend` and hid real findings there on the first runs.
	test('proof trees are skipped by name; a nested workspace lockfile is a project tree', async () => {
		root = await testTempDir('aidd-advisory-ignored-');
		const proof = classifyLockfile(
			join(root, 'aidd-build-proofs-public', 'proofs', 'a', 'source', 'bun.lock'),
			root,
		);
		expect(proof.kind).toBe('artifact');
		const nested = classifyLockfile(join(root, 'burrowday', 'frontend', 'bun.lock'), root, {
			burrowday: ['petra'],
		});
		expect(nested).toMatchObject({ kind: 'project', owners: ['petra'], treeName: 'burrowday' });
	});
});

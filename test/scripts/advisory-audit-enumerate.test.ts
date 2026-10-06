import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	classifyLockfile,
	enumerateRoots,
	findLockfiles,
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

		expect(await findLockfiles(root)).toEqual(expected.sort());
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

		const clone = classifyLockfile(
			join(root, 'summon-cli-workflow', 'bun.lock'),
			root,
			new Set(),
			OWNERS,
		);
		expect(clone).toMatchObject({ kind: 'clone', owners: ['morgan'], parentTree: 'summon' });
		expect(classifyLockfile(join(root, 'summon-stream', 'bun.lock'), root).kind).toBe(
			'project',
		);
		expect(classifyLockfile(join(root, 'spernakit-browser', 'bun.lock'), root).kind).toBe(
			'project',
		);

		const project = classifyLockfile(join(root, 'deeper', 'bun.lock'), root, new Set(), OWNERS);
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

	// aidd-build-proofs-public holds whole vendored source trees, and the panel's ignoredFolders
	// names what aidd itself does not discover; neither is a tree anyone fixes.
	test('proof trees and the panel ignored folders are skipped with their reason', async () => {
		root = await testTempDir('aidd-advisory-ignored-');
		const proof = classifyLockfile(
			join(root, 'aidd-build-proofs-public', 'proofs', 'a', 'source', 'bun.lock'),
			root,
		);
		expect(proof.kind).toBe('artifact');
		const ignored = classifyLockfile(
			join(root, 'applications.prevers', 'old-app', 'bun.lock'),
			root,
			new Set(['applications.prevers']),
		);
		expect(ignored.kind).toBe('artifact');
		expect(ignored.reason).toContain('ignoredFolders');
		expect(
			classifyLockfile(join(root, 'live-app', 'bun.lock'), root, new Set(['other'])).kind,
		).toBe('project');
	});
});

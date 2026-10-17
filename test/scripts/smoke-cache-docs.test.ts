import { describe, expect, test } from 'bun:test';

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { canSkipStep, recordStepSuccess } from '../../scripts/smoke-cache.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';

// Record audit-qc-pipeline-1791780754 (check-docs cache key): check:docs is keyed on what the gate
// itself says it read (collectDocsInputs, smokestack v0.5.6), not on every markdown file. Each test
// first asserts the unchanged tree replays, as a positive control.

function git(root: string, ...args: string[]): void {
	const identity = ['-c', 'user.email=test@example.invalid', '-c', 'user.name=Test'];
	const run = Bun.spawnSync(['git', '-C', root, ...identity, ...args], {
		stderr: 'pipe',
		windowsHide: true,
	});
	if (run.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${run.stderr.toString()}`);
}

/** A git repository whose README links a JSON asset, a doc and a directory. */
async function docsProject(): Promise<string> {
	const root = await testTempDir('aidd-smoke-docs-');
	await mkdir(join(root, 'assets'), { recursive: true });
	await mkdir(join(root, 'docs'), { recursive: true });
	await mkdir(join(root, 'licenses'), { recursive: true });
	await writeFile(join(root, '.gitignore'), 'scripts/smoke-cache.json\n');
	await writeFile(join(root, 'package.json'), '{"name":"fixture"}\n');
	await writeFile(
		join(root, 'README.md'),
		'[sample](assets/sample.json) [guide](docs/guide.md) [licences](licenses)\n',
	);
	await writeFile(join(root, 'assets', 'sample.json'), '{}\n');
	await writeFile(join(root, 'docs', 'guide.md'), '# Guide\n');
	await writeFile(join(root, 'licenses', 'MIT.txt'), 'MIT\n');
	git(root, 'init', '-q');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'fixture');
	return root;
}

async function recorded(): Promise<string> {
	const root = await docsProject();
	await recordStepSuccess(root, 'check:docs', 123);
	expect(await canSkipStep(root, 'check:docs')).toBe(true);
	return root;
}

describe('check:docs cache key', () => {
	test('misses when a linked non-markdown file is deleted', async () => {
		const root = await recorded();
		await rm(join(root, 'assets', 'sample.json'));
		expect(await canSkipStep(root, 'check:docs')).toBe(false);
	});

	test('misses when a linked doc becomes gitignored', async () => {
		const root = await recorded();
		await writeFile(join(root, '.gitignore'), 'scripts/smoke-cache.json\ndocs/guide.md\n');
		expect(await canSkipStep(root, 'check:docs')).toBe(false);
	});

	test('misses when a linked directory is removed, though none of its files was an input', async () => {
		const root = await recorded();
		await removeTempTree(join(root, 'licenses'));
		expect(await canSkipStep(root, 'check:docs')).toBe(false);
	});

	// Roger (90e075ed, Medium): the hasher dropped every path under data/, logs/ and the other
	// excluded folders, so a linked data/ file could vanish with the key unchanged.
	test('misses when a linked file under an excluded folder such as data/ is deleted', async () => {
		const root = await docsProject();
		await mkdir(join(root, 'data'), { recursive: true });
		await writeFile(join(root, 'data', 'sample.json'), '{}\n');
		await writeFile(join(root, 'README.md'), '[data](data/sample.json)\n');
		await recordStepSuccess(root, 'check:docs', 123);
		expect(await canSkipStep(root, 'check:docs')).toBe(true);
		await rm(join(root, 'data', 'sample.json'));
		expect(await canSkipStep(root, 'check:docs')).toBe(false);
	});

	test('still replays after a write the gate never reads', async () => {
		const root = await recorded();
		await mkdir(join(root, '.aidd'), { recursive: true });
		await writeFile(join(root, '.aidd', 'notes.md'), '# Notes\n');
		expect(await canSkipStep(root, 'check:docs')).toBe(true);
	});
});

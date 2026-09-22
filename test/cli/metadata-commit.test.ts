import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { commitOwnedMetadata } from '../../cli/src/orchestrator/run/metadata-commit.ts';
import { gitDirtySourcePaths } from '../../cli/src/orchestrator/run/git.ts';
import { testTempDir } from '../_helpers/temp.ts';

// The park path is what this closes: an agent commits and reports a clean tree, then the run
// writes the feature's blockingContext, and in a project that tracks .aidd/ that record sat
// uncommitted until someone noticed the repository was dirty.

async function git(dir: string, args: string[]): Promise<string> {
	const proc = Bun.spawn(['git', '-C', dir, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const out = await new Response(proc.stdout).text();
	if ((await proc.exited) !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${await new Response(proc.stderr).text()}`);
	}
	return out;
}

/** A repository with a committed feature record and one committed source file. */
async function repo(gitignore = ''): Promise<string> {
	const dir = await testTempDir('aidd-metadata-commit-');
	await git(dir, ['init', '-q']);
	await git(dir, ['config', 'user.email', 'test@aidd.local']);
	await git(dir, ['config', 'user.name', 'aidd test']);
	await git(dir, ['config', 'commit.gpgsign', 'false']);
	await mkdir(join(dir, '.aidd', 'features', 'demo'), { recursive: true });
	await writeFile(join(dir, '.aidd', 'features', 'demo', 'feature.json'), '{"id":"demo"}\n');
	await writeFile(join(dir, '.aidd', 'notes.md'), 'notes\n');
	await writeFile(join(dir, 'src.ts'), 'export const value = 1;\n');
	if (gitignore !== '') await writeFile(join(dir, '.gitignore'), gitignore);
	await git(dir, ['add', '-A']);
	await git(dir, ['commit', '-q', '-m', 'baseline']);
	return dir;
}

async function dirtyPaths(dir: string): Promise<string[]> {
	return (await gitDirtySourcePaths(dir, { includeAiddMetadata: true })) ?? [];
}

describe('run-end metadata commit', () => {
	test('commits the record the run wrote after the agent stopped', async () => {
		const dir = await repo();

		// What recordVerificationSelfPark does once the agent's own commit has landed.
		await writeFile(
			join(dir, '.aidd', 'features', 'demo', 'feature.json'),
			'{"id":"demo","status":"waiting_approval"}\n',
		);

		const committed = await commitOwnedMetadata(dir, new Set());

		expect(committed?.paths).toEqual(['.aidd/features/demo/feature.json']);
		expect(await dirtyPaths(dir)).toEqual([]);
		const subject = await git(dir, ['log', '-1', '--pretty=%s']);
		expect(subject.trim()).toBe('chore(aidd): record run metadata');
	});

	test('leaves source files to the run-end dirty-source check', async () => {
		const dir = await repo();
		await writeFile(join(dir, 'src.ts'), 'export const value = 2;\n');
		await writeFile(join(dir, '.aidd', 'features', 'demo', 'feature.json'), '{"id":"demo2"}\n');

		const committed = await commitOwnedMetadata(dir, new Set());

		expect(committed?.paths).toEqual(['.aidd/features/demo/feature.json']);
		// The source edit is still uncommitted, which is the accounting this must not disturb.
		expect(await dirtyPaths(dir)).toEqual(['src.ts']);
	});

	test('leaves metadata the operator was already editing', async () => {
		const dir = await repo();
		await writeFile(join(dir, '.aidd', 'notes.md'), 'a note the operator is writing\n');
		const baseline = new Set(await dirtyPaths(dir));
		await writeFile(join(dir, '.aidd', 'features', 'demo', 'feature.json'), '{"id":"demo3"}\n');

		const committed = await commitOwnedMetadata(dir, baseline);

		expect(committed?.paths).toEqual(['.aidd/features/demo/feature.json']);
		expect(await dirtyPaths(dir)).toEqual(['.aidd/notes.md']);
	});

	test('commits nothing when the run wrote nothing, or when the baseline is unknown', async () => {
		const dir = await repo();

		expect(await commitOwnedMetadata(dir, new Set())).toBeUndefined();

		await writeFile(join(dir, '.aidd', 'features', 'demo', 'feature.json'), '{"id":"demo4"}\n');
		// An uncapturable baseline cannot separate the run's writes from the operator's.
		expect(await commitOwnedMetadata(dir, undefined)).toBeUndefined();
		expect(await dirtyPaths(dir)).toEqual(['.aidd/features/demo/feature.json']);
	});

	test('does nothing in a project that gitignores its .aidd directory', async () => {
		const dir = await repo('/.aidd/\n');
		await writeFile(join(dir, '.aidd', 'features', 'demo', 'feature.json'), '{"id":"demo5"}\n');

		expect(await commitOwnedMetadata(dir, new Set())).toBeUndefined();
	});
});

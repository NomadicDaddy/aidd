import { afterAll, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { inspectRepo } from '../../scripts/check-fleet-hook-wiring.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

// Roger after #23144 (2026-10-25): every installed guard in the fleet was reachable while
// commitwatch had no hook of any kind, and the check passed it, because it only asked whether an
// installed guard fires.

const created: string[] = [];

afterAll(async () => {
	for (const dir of created) await removeTempTree(dir);
});

function git(cwd: string, args: string[]): void {
	Bun.spawnSync(['git', ...args], { cwd, stderr: 'ignore', stdout: 'ignore', windowsHide: true });
}

/** A git repository that ignores .env, so question 5 stays out of the way. */
async function repo(name: string): Promise<string> {
	const dir = join(await testTempDir('hook-wiring'), name);
	created.push(dir);
	await mkdir(dir, { recursive: true });
	git(dir, ['init']);
	await writeFile(join(dir, '.gitignore'), '.env\n');
	return dir;
}

/** smokestack's v0.6.0 layout: the hooks folder as core.hooksPath, pre-commit calling the guard. */
async function smokestackGuarded(name: string): Promise<string> {
	const dir = await repo(name);
	const hooks = join(dir, 'scripts', 'smokestack', 'hooks');
	await mkdir(hooks, { recursive: true });
	await writeFile(join(hooks, 'leak-guard.sh'), '#!/bin/sh\nexit 0\n');
	await writeFile(
		join(hooks, 'pre-commit'),
		'#!/bin/sh\nhooks_dir=$(dirname "$0")\nbash "$hooks_dir/leak-guard.sh"\n',
	);
	git(dir, ['config', '--local', 'core.hooksPath', 'scripts/smokestack/hooks']);
	return dir;
}

describe('every repository runs the leak guard or declines it', () => {
	test('a repository with no hook at all is reported unguarded', async () => {
		const { problems } = inspectRepo(await repo('unguarded'));
		expect(problems).toEqual([
			expect.stringContaining('unguarded: no active pre-commit runs the leak guard'),
		]);
	});

	test('a repository that declines with .no-fleet-sync is not reported', async () => {
		const dir = await repo('declines');
		await writeFile(join(dir, '.no-fleet-sync'), 'not a fleet member\n');
		expect(inspectRepo(dir).problems).toEqual([]);
	});

	test('smokestack v0.6.0 layout with a live pre-commit passes', async () => {
		expect(inspectRepo(await smokestackGuarded('guarded')).problems).toEqual([]);
	});

	test('a v0.6.0 guard that nothing dispatches is reported dead, not missing', async () => {
		const dir = await smokestackGuarded('dead');
		git(dir, ['config', '--local', '--unset', 'core.hooksPath']);
		expect(inspectRepo(dir).problems).toEqual([
			expect.stringContaining(
				'dead: leak-guard.sh is present but no active pre-commit calls it',
			),
		]);
	});
});

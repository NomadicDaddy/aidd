import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { testTempRoot } from '../_helpers/temp.ts';
import { collectDirectDependencies } from '../../scripts/lib/third-party-licenses/collect.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

const root = join(testTempRoot, 'license-collect-workspace');

afterEach(async () => {
	await removeTempTree(root);
});

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(join(path, '..'), { recursive: true });
	await writeFile(path, JSON.stringify(value));
}

async function installPackage(dir: string, name: string, version: string): Promise<void> {
	await writeJson(join(dir, 'node_modules', name, 'package.json'), {
		license: 'MIT',
		name,
		version,
	});
}

describe('direct dependency collection', () => {
	// Two workspaces declaring different versions of one package is what an ordinary dependency
	// update produces: the installer keeps one copy at the root and the other beside the
	// workspace that asked for it. The table must name the version each workspace actually runs.
	test('reports the version installed for the workspace that declares it', async () => {
		await writeJson(join(root, 'package.json'), { name: 'fixture' });
		await writeJson(join(root, 'backend', 'package.json'), {
			dependencies: { shared: '1.0.0' },
			name: 'fixture-backend',
		});
		await writeJson(join(root, 'shared', 'package.json'), {
			dependencies: { shared: '2.0.0' },
			name: 'fixture-shared',
		});
		await installPackage(root, 'shared', '1.0.0');
		await installPackage(join(root, 'shared'), 'shared', '2.0.0');

		const { dependencies, unresolved } = await collectDirectDependencies(root, [
			'backend',
			'shared',
		]);

		expect(unresolved).toEqual([]);
		expect(dependencies).toEqual([
			{ license: 'MIT', name: 'shared', version: '1.0.0', workspace: 'backend' },
			{ license: 'MIT', name: 'shared', version: '2.0.0', workspace: 'shared' },
		]);
	});

	test('falls back to the root copy when the workspace has none of its own', async () => {
		await writeJson(join(root, 'package.json'), { name: 'fixture' });
		await writeJson(join(root, 'cli', 'package.json'), {
			dependencies: { hoisted: '3.1.0' },
			name: 'fixture-cli',
		});
		await installPackage(root, 'hoisted', '3.1.0');

		const { dependencies, unresolved } = await collectDirectDependencies(root, ['cli']);

		expect(unresolved).toEqual([]);
		expect(dependencies).toEqual([
			{ license: 'MIT', name: 'hoisted', version: '3.1.0', workspace: 'cli' },
		]);
	});
});

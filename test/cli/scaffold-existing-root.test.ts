import type { RunPlan } from 'aidd-shared/plan/types';

import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scaffoldProjectAssets } from '../../cli/src/metadata/scaffold.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

const roots: string[] = [];

afterEach(async () => {
	const pending = roots.splice(0);
	for (let i = 0; i < pending.length; i++) await removeTempTree(pending[i] as string);
});

function initializerPlan(projectDir: string): RunPlan {
	return { projectDir, prompt: { phase: 'initializer' }, scope: {} } as RunPlan;
}

// An aidd install root whose scaffolding carries the full root contract plus one .aidd file.
async function makeAiddRoot(root: string): Promise<string> {
	const aiddRoot = join(root, 'aidd');
	const scaffolding = join(aiddRoot, 'scaffolding');
	await mkdir(join(scaffolding, '.aidd'), { recursive: true });
	await mkdir(join(scaffolding, 'frontend'), { recursive: true });
	await mkdir(join(scaffolding, 'scripts'), { recursive: true });
	await writeFile(join(scaffolding, 'package.json'), '{"name":"scaffold"}\n');
	await writeFile(join(scaffolding, 'tsconfig.json'), '{}\n');
	await writeFile(join(scaffolding, 'eslint.config.js'), 'export default [];\n');
	await writeFile(join(scaffolding, '.prettierrc'), '{}\n');
	await writeFile(join(scaffolding, 'frontend', 'index.html'), '<html></html>\n');
	await writeFile(join(scaffolding, 'scripts', 'require-bun.ts'), '// guard\n');
	await writeFile(join(scaffolding, '.aidd', 'CHANGELOG.md'), '# Changelog\n');
	return aiddRoot;
}

describe('initializer root scaffold on a project that already has its own root', () => {
	test('a project with its own package.json receives no root scaffold file or directory', async () => {
		const root = await testTempDir('aidd-scaffold-existing-');
		roots.push(root);
		const aiddRoot = await makeAiddRoot(root);
		const projectDir = join(root, 'derived-app');
		await mkdir(projectDir, { recursive: true });
		// The shape of a Spernakit-derived app: its own manifest, and deliberately no root tsconfig.
		const ownManifest = '{"name":"derived-app","spernakit_version":"3.47.3"}\n';
		await writeFile(join(projectDir, 'package.json'), ownManifest);

		await scaffoldProjectAssets(initializerPlan(projectDir), aiddRoot);

		expect(existsSync(join(projectDir, 'tsconfig.json'))).toBe(false);
		expect(existsSync(join(projectDir, 'eslint.config.js'))).toBe(false);
		expect(existsSync(join(projectDir, '.prettierrc'))).toBe(false);
		expect(existsSync(join(projectDir, 'frontend'))).toBe(false);
		expect(existsSync(join(projectDir, 'scripts'))).toBe(false);
		expect(await readFile(join(projectDir, 'package.json'), 'utf8')).toBe(ownManifest);
		// The .aidd metadata scaffold is unchanged by the fix and still installs.
		expect(existsSync(join(projectDir, '.aidd', 'CHANGELOG.md'))).toBe(true);
		expect(existsSync(join(projectDir, '.aidd', 'project.md'))).toBe(true);
	});

	test('an empty project still receives the full root contract', async () => {
		const root = await testTempDir('aidd-scaffold-existing-');
		roots.push(root);
		const aiddRoot = await makeAiddRoot(root);
		const projectDir = join(root, 'fresh-app');

		await scaffoldProjectAssets(initializerPlan(projectDir), aiddRoot);

		expect(await readFile(join(projectDir, 'package.json'), 'utf8')).toBe(
			'{"name":"scaffold"}\n',
		);
		expect(existsSync(join(projectDir, 'tsconfig.json'))).toBe(true);
		expect(existsSync(join(projectDir, 'eslint.config.js'))).toBe(true);
		expect(existsSync(join(projectDir, 'frontend', 'index.html'))).toBe(true);
		expect(existsSync(join(projectDir, 'scripts', 'require-bun.ts'))).toBe(true);
		expect(existsSync(join(projectDir, '.aidd', 'CHANGELOG.md'))).toBe(true);
	});
});

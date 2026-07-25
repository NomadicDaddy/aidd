import { afterEach, describe, expect, test } from 'bun:test';

import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { defaultIgnoredFolders } from '../../shared/src/config/schema.ts';
import {
	createIgnoredDirectoryMatcher,
	scanRoot,
} from '../../backend/src/services/project/discovery.ts';

import { testTempDir } from '../_helpers/temp.ts';
const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0)) {
		await rm(root, { force: true, recursive: true });
	}
});

// Mirror a standalone install: the app folder (with its bundled asset dirs) sits under the same
// parent that discovery falls back to when no roots are configured, next to a real user project.
async function seedInstallLayout(): Promise<string> {
	const base = await testTempDir('aidd-discovery-');
	roots.push(base);
	await mkdir(join(base, 'aidd-v9.9.9-bun-windows-x64-modern', 'scaffolding', '.aidd'), {
		recursive: true,
	});
	await mkdir(join(base, 'aidd-v9.9.9-bun-windows-x64-modern', 'frontend', '.aidd'), {
		recursive: true,
	});
	await mkdir(join(base, 'my-project', '.aidd'), { recursive: true });
	return base;
}

describe('project discovery ignores bundled distribution assets', () => {
	test('surfaces real projects but not the bundled scaffolding/ template', async () => {
		const base = await seedInstallLayout();
		const result = await scanRoot(
			base,
			5,
			createIgnoredDirectoryMatcher(defaultIgnoredFolders),
		);
		const paths = result.projects.map((project) => project.path);

		expect(paths.some((path) => path.endsWith('my-project'))).toBe(true);
		expect(paths.some((path) => path.includes('scaffolding'))).toBe(false);
		expect(paths.some((path) => path.includes('frontend'))).toBe(false);
	});
});

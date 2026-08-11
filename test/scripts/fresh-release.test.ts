import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { validateFreshRelease } from '../../scripts/lib/fresh-release/validation.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

const roots: string[] = [];

async function seedRoot(extraFiles: Record<string, string> = {}): Promise<string> {
	const root = await testTempDir('aidd-fresh-release-');
	roots.push(root);
	await mkdir(join(root, 'docs'), { recursive: true });
	await writeFile(join(root, 'package.json'), '{"version":"2.130.1"}\n');
	await writeFile(join(root, 'VERSION'), '2.130.1\n');
	await writeFile(
		join(root, 'docs', 'CHANGELOG.md'),
		'# Changelog\n\n## [2.130.1] - 2026-07-21\n\n- Baseline.\n',
	);
	for (const [path, content] of Object.entries(extraFiles)) {
		await mkdir(join(root, path, '..'), { recursive: true });
		await writeFile(join(root, path), content);
	}
	const init = Bun.spawnSync(['git', '-C', root, 'init', '--quiet'], { windowsHide: true });
	if (init.exitCode !== 0) throw new Error('git init failed');
	const add = Bun.spawnSync(['git', '-C', root, 'add', '.'], { windowsHide: true });
	if (add.exitCode !== 0) throw new Error('git add failed');
	return root;
}

afterEach(async () => {
	for (const root of roots.splice(0)) await removeTempTree(root);
});

describe('fresh release baseline validation', () => {
	test('accepts the baseline and generic dependency/API versions', async () => {
		const root = await seedRoot({
			'.github/workflows/ci.yml': 'uses: vendor/action@sha # v2.2.0\n',
			'docs/api.md': 'This API follows protocol v2.4.0.\n',
		});
		expect(await validateFreshRelease(root)).toEqual([]);
	});

	test('rejects a pre-baseline artifact name and changelog entry', async () => {
		const root = await seedRoot({
			'docs/old.md': 'Download aidd-v2.129.0-bun-windows-x64-modern.zip.\n',
		});
		await writeFile(
			join(root, 'docs', 'CHANGELOG.md'),
			'# Changelog\n\n## [2.130.1]\n\n## [2.129.0]\n',
		);
		const issues = await validateFreshRelease(root);
		expect(issues.join('\n')).toContain('pre-baseline aidd release 2.129.0');
		expect(issues.join('\n')).toContain('contains pre-baseline release 2.129.0');
	});

	test('rejects a second current-or-later changelog entry', async () => {
		const root = await seedRoot();
		await writeFile(
			join(root, 'docs', 'CHANGELOG.md'),
			'# Changelog\n\n## [2.130.1]\n\n## [2.130.2]\n',
		);
		expect((await validateFreshRelease(root)).join('\n')).toContain(
			'must contain exactly one 2.130.1 release entry',
		);
	});
});

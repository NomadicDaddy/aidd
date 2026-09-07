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
	await writeFile(join(root, 'package.json'), '{"version":"3.0.0"}\n');
	await writeFile(join(root, 'VERSION'), '3.0.0\n');
	await writeFile(
		join(root, 'docs', 'CHANGELOG.md'),
		'# Changelog\n\n## [3.0.0] - 2026-08-15\n\n- Baseline.\n',
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
			'docs/reference/coderabbit.md': "CodeRabbit's paid plans cover third-party usage.\n",
		});
		expect(await validateFreshRelease(root)).toEqual([]);
	});

	test('rejects paid or gated aidd variants in public copy', async () => {
		const root = await seedRoot({
			'README.md': 'Upgrade to aidd Pro.\n',
			'docs/reference/licensing.md': 'A paid edition is available.\n',
			'frontend/content/docs/plans.md': 'aidd has pricing tiers.\n',
			'site/index.html': '<p>Paste your product key to activate.</p>\n',
		});
		const issues = await validateFreshRelease(root);
		expect(issues).toContain('README.md: references a paid or gated aidd product variant');
		expect(issues).toContain(
			'docs/reference/licensing.md: references a paid or gated aidd product variant',
		);
		expect(issues).toContain(
			'frontend/content/docs/plans.md: references a paid or gated aidd product variant',
		);
		expect(issues).toContain(
			'site/index.html: references a paid or gated aidd product variant',
		);
	});

	test('rejects a pre-baseline artifact name and changelog entry', async () => {
		const root = await seedRoot({
			'docs/old.md': 'Download aidd-v2.140.0-bun-windows-x64-modern.zip.\n',
		});
		await writeFile(
			join(root, 'docs', 'CHANGELOG.md'),
			'# Changelog\n\n## [3.0.0]\n\n## [2.140.0]\n',
		);
		const issues = await validateFreshRelease(root);
		expect(issues.join('\n')).toContain('pre-baseline aidd release 2.140.0');
		expect(issues.join('\n')).toContain('contains pre-baseline release 2.140.0');
		expect(issues.join('\n')).toContain('references retired binary distribution');
	});

	test('rejects binary distribution files and public install instructions', async () => {
		const root = await seedRoot({
			'.dockerignore': 'dist/\n',
			'docs/reference/deployment.md': 'Download the standalone zip and SHA256SUMS.txt.\n',
		});
		const issues = await validateFreshRelease(root);
		expect(issues.join('\n')).toContain(
			'.dockerignore: retired binary or container distribution artifact is tracked',
		);
		expect(issues.join('\n')).toContain(
			'docs/reference/deployment.md: references retired binary distribution',
		);
	});

	test('rejects a second current-or-later changelog entry', async () => {
		const root = await seedRoot();
		await writeFile(
			join(root, 'docs', 'CHANGELOG.md'),
			'# Changelog\n\n## [3.0.0]\n\n## [3.0.1]\n',
		);
		expect((await validateFreshRelease(root)).join('\n')).toContain(
			'must contain exactly one 3.0.0 release entry',
		);
	});
});

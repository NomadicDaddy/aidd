import { describe, expect, test } from 'bun:test';

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { REQUIRED_SCAFFOLD_PATHS } from '../../scripts/check-scaffold.ts';
import { STEP_DEPENDENCIES } from '../../scripts/lib/smoke-cache/dependencies.ts';
import { scannedPaths } from '../../scripts/self-contained.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

const toolPath = join(import.meta.dir, '..', '..', 'scripts', 'self-contained.ts');
const spernakitReference = 'See `' + 'sperna' + 'kit/docs/template/DEVELOPMENT.md` for style.';

async function runSelfContained(cwd: string): Promise<{ exitCode: number; stderr: string }> {
	const proc = Bun.spawn(['bun', toolPath], {
		cwd,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { exitCode, stderr };
}

function git(cwd: string, ...args: string[]): void {
	const result = Bun.spawnSync(['git', '-C', cwd, ...args], { windowsHide: true });
	if (result.exitCode !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}`);
}

// A minimal tree the check accepts, as a git checkout that ignores AGENTS.md the way aidd does.
async function checkoutFixture(): Promise<string> {
	const root = await testTempDir('aidd-sc-ignored-');
	for (const dir of ['backend', 'cli', 'shared', 'test', 'audits', 'docs', 'skills', 'prompts']) {
		await mkdir(join(root, dir), { recursive: true });
	}
	await mkdir(join(root, 'scripts'), { recursive: true });
	await writeFile(join(root, 'package.json'), '{}');
	await writeFile(join(root, 'tsconfig.json'), '{}');
	for (const path of REQUIRED_SCAFFOLD_PATHS) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), '');
	}
	await writeFile(join(root, '.gitignore'), 'AGENTS.md\n');
	git(root, 'init', '--quiet');
	return root;
}

describe('self-contained tool in a git checkout', () => {
	test('does not read a file git ignores', async () => {
		const root = await checkoutFixture();
		try {
			await writeFile(join(root, 'AGENTS.md'), `${spernakitReference}\n`);
			const { exitCode, stderr } = await runSelfContained(root);
			expect(stderr).toBe('');
			expect(exitCode).toBe(0);
		} finally {
			await removeTempTree(root);
		}
	});

	test('still reads a new file git does not ignore', async () => {
		const root = await checkoutFixture();
		try {
			await writeFile(join(root, 'AGENTS.md'), `${spernakitReference}\n`);
			await writeFile(join(root, 'docs', 'style.md'), `${spernakitReference}\n`);
			const { exitCode, stderr } = await runSelfContained(root);
			expect(exitCode).toBe(1);
			expect(stderr).toContain('docs/style.md:1: [unresolved Spernakit repository path]');
			expect(stderr).not.toContain('AGENTS.md');
		} finally {
			await removeTempTree(root);
		}
	});
});

// A scanned root missing from the step's cache inputs lets an edit to it replay a cached pass;
// root AGENTS.md was one until roger's review of 7c30c2d5.
describe('self-contained cache inputs', () => {
	test('cover every root the check scans', () => {
		const inputs = STEP_DEPENDENCIES['self-contained'] ?? [];
		const uncovered = scannedPaths.filter(
			(root) => !inputs.includes(root) && !inputs.includes(`${root}/**/*`),
		);
		expect(uncovered).toEqual([]);
	});
});

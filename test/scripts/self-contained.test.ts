import { describe, expect, test } from 'bun:test';

import { SMOKE_QC_STEPS } from '../../scripts/smoke-qc.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
async function runSelfContained(cwd: string): Promise<{ exitCode: number; stdout: string }> {
	const toolPath = join(import.meta.dir, '..', '..', 'scripts', 'self-contained.ts');
	const proc = Bun.spawn(['bun', toolPath], {
		cwd,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const stdout = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { exitCode, stdout };
}

describe('self-contained tool', () => {
	test('passes in the current repository', async () => {
		const { exitCode } = await runSelfContained(process.cwd());
		expect(exitCode).toBe(0);
	});

	test('fails with exact missing scaffolding file path', async () => {
		const tmp = await testTempDir('aidd-sc-test-');
		try {
			// Create minimal directory structure (no scaffolding files)
			for (const dir of [
				'backend',
				'cli',
				'shared',
				'test',
				'audits',
				'docs',
				'skills',
				'prompts',
				'scaffolding',
				'scripts',
			]) {
				await mkdir(join(tmp, dir), { recursive: true });
			}
			await writeFile(join(tmp, 'package.json'), '{}');
			await writeFile(join(tmp, 'tsconfig.json'), '{}');

			const { exitCode, stdout } = await runSelfContained(tmp);
			expect(exitCode).toBe(1);
			// Should mention each missing scaffolding file
			expect(stdout).toContain('scaffolding/.editorconfig');
			expect(stdout).toContain('scaffolding/.gitattributes');
			expect(stdout).toContain('scaffolding/.gitignore');
			expect(stdout).toContain('scaffolding/.prettierignore');
			expect(stdout).toContain('scaffolding/.prettierrc');
			expect(stdout).toContain('scaffolding/package.json');
			expect(stdout).toContain('scaffolding/scripts/require-bun.ts');
			expect(stdout).toContain('scaffolding/tsconfig.json');
		} finally {
			await removeTempTree(tmp);
		}
	});

	test('rejects stale active-runtime references', async () => {
		const tmp = await testTempDir('aidd-sc-test-');
		try {
			// Create minimal structure
			for (const dir of [
				'backend',
				'cli',
				'shared',
				'test',
				'audits',
				'docs',
				'skills',
				'prompts',
				'scaffolding',
				'scripts',
			]) {
				await mkdir(join(tmp, dir), { recursive: true });
			}
			await writeFile(join(tmp, 'package.json'), '{}');
			await writeFile(join(tmp, 'tsconfig.json'), '{}');

			// Create all scaffolding files
			const scaffoldingFiles = [
				'.editorconfig',
				'.gitattributes',
				'.gitignore',
				'.prettierignore',
				'.prettierrc',
			];
			for (const file of scaffoldingFiles) {
				await writeFile(join(tmp, 'scaffolding', file), '');
			}

			// Add a stale reference to aidd2 in cli/src/
			await mkdir(join(tmp, 'cli', 'src'), { recursive: true });
			await writeFile(
				join(tmp, 'cli', 'src', 'stale.ts'),
				'// path: D:\\applications\\aidd2\\src\\something.ts',
			);

			const { exitCode, stdout } = await runSelfContained(tmp);
			expect(exitCode).toBe(1);
			expect(stdout).toContain('aidd2');
		} finally {
			await removeTempTree(tmp);
		}
	});

	test('rejects references to the old ai source root in catalog files', async () => {
		const tmp = await testTempDir('aidd-sc-test-');
		try {
			for (const dir of [
				'backend',
				'cli',
				'shared',
				'test',
				'audits',
				'docs',
				'skills',
				'prompts',
				'scaffolding',
				'scripts',
			]) {
				await mkdir(join(tmp, dir), { recursive: true });
			}
			await writeFile(join(tmp, 'package.json'), '{}');
			await writeFile(join(tmp, 'tsconfig.json'), '{}');
			for (const file of [
				'.editorconfig',
				'.gitattributes',
				'.gitignore',
				'.prettierignore',
				'.prettierrc',
			]) {
				await writeFile(join(tmp, 'scaffolding', file), '');
			}
			await writeFile(
				join(tmp, 'skills', 'leak.md'),
				'Use d:/applications/ai/skills/source.md here.',
			);

			const { exitCode, stdout } = await runSelfContained(tmp);
			expect(exitCode).toBe(1);
			expect(stdout).toContain('D:\\applications\\ai');
			expect(stdout).toContain('skills/leak.md');
		} finally {
			await removeTempTree(tmp);
		}
	});

	test('rejects stale aidd-core command examples', async () => {
		const tmp = await testTempDir('aidd-sc-test-');
		try {
			for (const dir of [
				'backend',
				'cli',
				'shared',
				'test',
				'audits',
				'docs',
				'skills',
				'prompts',
				'scaffolding',
				'scripts',
			]) {
				await mkdir(join(tmp, dir), { recursive: true });
			}
			await writeFile(join(tmp, 'package.json'), '{}');
			await writeFile(join(tmp, 'tsconfig.json'), '{}');
			for (const file of [
				'.editorconfig',
				'.gitattributes',
				'.gitignore',
				'.prettierignore',
				'.prettierrc',
			]) {
				await writeFile(join(tmp, 'scaffolding', file), '');
			}
			await writeFile(join(tmp, 'skills', 'leak.md'), 'bun ./aidd/aidd-core/src/index.ts');

			const { exitCode, stdout } = await runSelfContained(tmp);
			expect(exitCode).toBe(1);
			expect(stdout).toContain('aidd-core');
			expect(stdout).toContain('skills/leak.md');
		} finally {
			await removeTempTree(tmp);
		}
	});
});

describe('self-contained package spec verification', () => {
	test('smoke:qc wrapper includes bun run self-contained', async () => {
		const pkg = await Bun.file('package.json').json();
		expect(pkg.scripts['smoke:qc']).toBe('bun scripts/smoke-qc.ts');
		expect(SMOKE_QC_STEPS.map((step) => step.command.join(' '))).toContain(
			'bun run self-contained',
		);
	});

	test('root package.json includes prettier-plugin-tailwindcss for frontend tailwind support', async () => {
		const raw = await Bun.file('package.json').text();
		expect(raw).toContain('prettier-plugin-tailwindcss');
	});

	test('root .prettierrc includes prettier-plugin-tailwindcss for frontend tailwind support', async () => {
		const raw = await Bun.file('.prettierrc').text();
		expect(raw).toContain('prettier-plugin-tailwindcss');
	});

	test('scaffolding/.prettierrc keeps tailwind plugin for generated projects', async () => {
		const raw = await Bun.file('scaffolding/.prettierrc').text();
		expect(raw).toContain('prettier-plugin-tailwindcss');
	});

	test('root .gitignore does not ignore scaffolding/', async () => {
		const raw = await Bun.file('.gitignore').text();
		// scaffolding/ should NOT be in gitignore as an active ignore rule
		const lines = raw.split('\n');
		const scaffoldingIgnore = lines.find(
			(line) => line.trim() === 'scaffolding/' || line.trim() === 'scaffolding',
		);
		expect(scaffoldingIgnore).toBeUndefined();
	});

	test('scaffolding files are visible to git status', async () => {
		const requiredScaffolding = [
			'scaffolding/.editorconfig',
			'scaffolding/.gitattributes',
			'scaffolding/.gitignore',
			'scaffolding/.prettierignore',
			'scaffolding/.prettierrc',
			'scaffolding/package.json',
			'scaffolding/scripts/require-bun.ts',
			'scaffolding/tsconfig.json',
		];
		for (const file of requiredScaffolding) {
			const exists = await Bun.file(file).exists();
			expect(exists).toBe(true);
		}
	});
});

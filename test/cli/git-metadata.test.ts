import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { ensureProjectGitRepo } from '../../cli/src/metadata/git.ts';

import { testTempDir } from '../_helpers/temp.ts';
async function makeRoot(): Promise<string> {
	return await testTempDir('aidd-git-metadata-test-');
}

async function runGit(cwd: string, args: string[]): Promise<string> {
	const proc = Bun.spawn(['git', '-C', cwd, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${stderr || stdout}`);
	}
	return stdout.trim();
}

function normalizePath(path: string): string {
	const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
	return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

describe('ensureProjectGitRepo', () => {
	test('initializes a project directory without a Git repo', async () => {
		const root = await makeRoot();
		try {
			const projectDir = join(root, 'fresh-project');
			await mkdir(projectDir, { recursive: true });

			const result = await ensureProjectGitRepo(projectDir);

			expect(result).toBe('initialized');
			expect(existsSync(join(projectDir, '.git'))).toBe(true);
			expect(normalizePath(await runGit(projectDir, ['rev-parse', '--show-toplevel']))).toBe(
				normalizePath(projectDir),
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('leaves an existing project-owned Git repo in place', async () => {
		const root = await makeRoot();
		try {
			const projectDir = join(root, 'existing-project');
			await mkdir(projectDir, { recursive: true });
			await runGit(projectDir, ['init']);

			const result = await ensureProjectGitRepo(projectDir);

			expect(result).toBe('present');
			expect(normalizePath(await runGit(projectDir, ['rev-parse', '--show-toplevel']))).toBe(
				normalizePath(projectDir),
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('creates a project-owned repo inside a parent Git repo', async () => {
		const root = await makeRoot();
		try {
			await runGit(root, ['init']);
			const projectDir = join(root, 'nested-project');
			await mkdir(projectDir, { recursive: true });

			const result = await ensureProjectGitRepo(projectDir);

			expect(result).toBe('initialized');
			expect(normalizePath(await runGit(projectDir, ['rev-parse', '--show-toplevel']))).toBe(
				normalizePath(projectDir),
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});

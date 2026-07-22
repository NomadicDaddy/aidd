import { describe, expect, test } from 'bun:test';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { WebContext } from '../../backend/src/context.ts';

import { createProjectCodeRoutes } from '../../backend/src/routes/projectCode.ts';
import {
	readProjectCodeFile,
	readProjectCodeTree,
} from '../../backend/src/services/project/codeView.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
async function git(cwd: string, ...args: string[]): Promise<string> {
	const subprocess = Bun.spawn(['git', ...args], {
		cwd,
		stderr: 'pipe',
		stdin: 'ignore',
		stdout: 'pipe',
		windowsHide: true,
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(subprocess.stdout).text(),
		new Response(subprocess.stderr).text(),
		subprocess.exited,
	]);
	if (exitCode !== 0) throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
	return stdout.trim();
}

async function makeRepo(): Promise<string> {
	const repoDir = await testTempDir('aidd-code-view-');
	await git(repoDir, 'init');
	await git(repoDir, 'config', 'user.email', 'test@example.com');
	await git(repoDir, 'config', 'user.name', 'aidd Test');
	await mkdir(join(repoDir, 'src'), { recursive: true });
	await writeFile(join(repoDir, 'src', 'index.ts'), 'export const answer = 42;\n');
	await writeFile(join(repoDir, 'README.md'), '# Code view\n');
	await writeFile(join(repoDir, '.gitignore'), 'ignored.ts\nsecret.txt\n');
	await writeFile(join(repoDir, 'ignored.ts'), 'export const ignored = true;\n');
	await writeFile(join(repoDir, 'secret.txt'), 'do not expose\n');
	await writeFile(join(repoDir, 'binary.bin'), Buffer.from([0, 1, 2, 3]));
	await mkdir(join(repoDir, 'images'), { recursive: true });
	await writeFile(
		join(repoDir, 'images', 'pixel.png'),
		Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGA' +
				'WjR9awAAAABJRU5ErkJggg==',
			'base64'
		)
	);
	await git(repoDir, 'add', 'src', 'README.md', '.gitignore', 'binary.bin', 'images');
	await git(repoDir, 'commit', '-m', 'feat: seed code view repo');
	return repoDir;
}

describe('project code view service', () => {
	test('lists git-tracked files and excludes ignored untracked files', async () => {
		const repoDir = await makeRepo();
		try {
			const result = await readProjectCodeTree(repoDir);
			expect(result.state).toBe('ok');
			expect(result.files.map((file) => file.path)).toContain('src/index.ts');
			expect(result.files.map((file) => file.path)).toContain('README.md');
			expect(result.files.map((file) => file.path)).not.toContain('ignored.ts');
			expect(result.files.map((file) => file.path)).not.toContain('secret.txt');
			expect(result.files.find((file) => file.path === 'src/index.ts')?.language).toBe(
				'TypeScript'
			);
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('reads tracked text files and rejects ignored, absolute, and traversal paths', async () => {
		const repoDir = await makeRepo();
		try {
			const file = await readProjectCodeFile(repoDir, 'src/index.ts');
			expect(file.state).toBe('ok');
			expect(file.content).toContain('answer');
			expect(file.language).toBe('TypeScript');

			for (const requested of [
				'ignored.ts',
				'secret.txt',
				':(glob)src/*.ts',
				'../outside.ts',
				'src/../README.md',
				'/etc/passwd',
				'C:/Windows/system.ini',
				'C:\\Windows\\system.ini',
				'',
				'src/index.ts\0',
			]) {
				const denied = await readProjectCodeFile(repoDir, requested);
				expect(denied.state).toBe('invalid-path');
				expect(denied.content).toBe('');
			}
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('does not render binary tracked files', async () => {
		const repoDir = await makeRepo();
		try {
			const binary = await readProjectCodeFile(repoDir, 'binary.bin');
			expect(binary.state).toBe('binary');
			expect(binary.content).toBe('');
			expect(binary.reason).toContain('Binary');
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('renders tracked image files as data URLs', async () => {
		const repoDir = await makeRepo();
		try {
			const image = await readProjectCodeFile(repoDir, 'images/pixel.png');
			expect(image.state).toBe('image');
			expect(image.content).toStartWith('data:image/png;base64,');
			expect(image.reason).toBeNull();
		} finally {
			await removeTempTree(repoDir);
		}
	});

	test('classifies non-repository directories', async () => {
		const plainDir = await testTempDir('aidd-code-view-plain-');
		try {
			const tree = await readProjectCodeTree(plainDir);
			expect(tree.state).toBe('not-a-repo');
			const file = await readProjectCodeFile(plainDir, 'src/index.ts');
			expect(file.state).toBe('not-a-repo');
		} finally {
			await removeTempTree(plainDir);
		}
	});

	test.skipIf(process.platform === 'win32')(
		'rejects tracked symlinks that resolve outside the project',
		async () => {
			const repoDir = await makeRepo();
			const outsideDir = await testTempDir('aidd-code-view-outside-');
			try {
				await writeFile(join(outsideDir, 'escape.ts'), 'export const escape = true;\n');
				await symlink(join(outsideDir, 'escape.ts'), join(repoDir, 'src', 'escape.ts'));
				await git(repoDir, 'add', 'src/escape.ts');
				const result = await readProjectCodeFile(repoDir, 'src/escape.ts');
				expect(result.state).toBe('invalid-path');
			} finally {
				await removeTempTree(repoDir);
				await removeTempTree(outsideDir);
			}
		}
	);
});

describe('project code view routes', () => {
	test('serves tree and file responses for a resolved project', async () => {
		const repoDir = await makeRepo();
		try {
			const app = createProjectCodeRoutes({
				projectService: {
					resolveDiscoveredProject: async () => repoDir,
				},
			} as unknown as WebContext);
			const treeResponse = await app.handle(
				new Request('http://localhost/api/v1/projects/some-id/code/tree')
			);
			expect(treeResponse.status).toBe(200);
			const tree = (await treeResponse.json()) as {
				files: { path: string }[];
				state: string;
			};
			expect(tree.state).toBe('ok');
			expect(tree.files.some((file) => file.path === 'src/index.ts')).toBe(true);

			const fileResponse = await app.handle(
				new Request(
					`http://localhost/api/v1/projects/some-id/code/file?path=${encodeURIComponent('src/index.ts')}`
				)
			);
			expect(fileResponse.status).toBe(200);
			const file = (await fileResponse.json()) as { content: string; state: string };
			expect(file.state).toBe('ok');
			expect(file.content).toContain('answer');
		} finally {
			await removeTempTree(repoDir);
		}
	});
});

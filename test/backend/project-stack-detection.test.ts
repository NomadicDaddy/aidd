import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { detectProjectStack } from '../../shared/src/metadata/project-stack.ts';
import { testTempDir } from '../_helpers/temp.ts';

async function withTempProject(
	files: Record<string, string>,
	run: (dir: string) => Promise<void>
): Promise<void> {
	const dir = await testTempDir('aidd-stack-');
	try {
		for (const [name, content] of Object.entries(files)) {
			const path = join(dir, name);
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, content, 'utf8');
		}
		await run(dir);
	} finally {
		await rm(dir, { force: true, recursive: true });
	}
}

describe('project stack detection', () => {
	test('package stack override wins over Spernakit and detected evidence', async () => {
		await withTempProject(
			{
				'package.json': JSON.stringify({
					dependencies: { react: '19.0.0', vite: '8.0.0' },
					spernakit_version: '3.8.0',
					stack: 'custom-platform',
				}),
			},
			async (dir) => {
				const stack = await detectProjectStack(dir);
				expect(stack.family).toBe('custom-platform');
				expect(stack.label).toBe('Custom Platform');
				expect(stack.frameworks).toEqual(expect.arrayContaining(['React', 'Vite']));
				expect(stack.source).toBe('package-declaration');
			}
		);
	});

	test('package Spernakit version produces the Spernakit family', async () => {
		await withTempProject(
			{ 'package.json': JSON.stringify({ spernakit_version: '3.8.0' }) },
			async (dir) => {
				const stack = await detectProjectStack(dir);
				expect(stack).toMatchObject({
					family: 'spernakit',
					label: 'Spernakit',
					source: 'package-declaration',
				});
			}
		);
	});

	test('does not borrow another project table marker or infer Node from a bare package', async () => {
		await withTempProject(
			{
				'AGENTS.md': '| spernakit | d:/applications/spernakit | [spernakit] |',
				'package.json': JSON.stringify({ name: 'tooling-only' }),
			},
			async (dir) => {
				const stack = await detectProjectStack(dir);
				expect(stack).toMatchObject({
					family: 'unknown',
					label: 'Unknown',
					source: 'unknown',
				});
			}
		);
	});

	test('uses a matching project row and ignores a negated marker', async () => {
		const root = await testTempDir('aidd-stack-root-');
		const project = join(root, 'vite-dashboard');
		try {
			await mkdir(project, { recursive: true });
			await writeFile(
				join(root, 'AGENTS.md'),
				'- vite-dashboard is registered [react+vite], not [spernakit]\n',
				'utf8'
			);
			await writeFile(
				join(project, 'package.json'),
				JSON.stringify({ dependencies: { react: '19.0.0', vite: '8.0.0' } }),
				'utf8'
			);
			const stack = await detectProjectStack(project, { containingRoot: root });
			expect(stack).toMatchObject({
				family: 'react-vite',
				label: 'React/Vite',
				source: 'project-declaration',
			});
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('accepts a strict local Stack declaration', async () => {
		await withTempProject({ 'AGENTS.md': 'Stack: [react+convex]\n' }, async (dir) => {
			const stack = await detectProjectStack(dir);
			expect(stack).toMatchObject({
				family: 'react-convex',
				label: 'React/Convex',
				source: 'project-declaration',
			});
		});
	});

	test('detects frameworks and runtime across declared workspaces', async () => {
		await withTempProject(
			{
				'backend/package.json': JSON.stringify({ dependencies: { elysia: '1.0.0' } }),
				'frontend/package.json': JSON.stringify({
					dependencies: { react: '19.0.0' },
					devDependencies: { vite: '8.0.0' },
				}),
				'package.json': JSON.stringify({
					devDependencies: { typescript: '6.0.0' },
					packageManager: 'bun@1.3.14',
					workspaces: ['backend', 'frontend'],
				}),
			},
			async (dir) => {
				const stack = await detectProjectStack(dir);
				expect(stack.family).toBe('react-vite');
				expect(stack.frameworks).toEqual(
					expect.arrayContaining(['Elysia', 'React', 'Vite'])
				);
				expect(stack.languages).toContain('TypeScript');
				expect(stack.runtimes).toContain('Bun');
			}
		);
	});

	test('detects Python without package metadata', async () => {
		await withTempProject({ 'routebook.py': 'print("route")\n' }, async (dir) => {
			const stack = await detectProjectStack(dir);
			expect(stack).toMatchObject({ family: 'python', label: 'Python', source: 'detected' });
		});
	});

	test('prefers PowerShell and Pode over JavaScript tooling', async () => {
		await withTempProject(
			{
				'package.json': JSON.stringify({
					devDependencies: { prettier: '3.0.0' },
					engines: { node: '>=24' },
				}),
				'podex.ps1': 'Start-PodeServer { }\n',
			},
			async (dir) => {
				const stack = await detectProjectStack(dir);
				expect(stack).toMatchObject({
					family: 'powershell-pode',
					label: 'PowerShell/Pode',
					source: 'detected',
				});
			}
		);
	});

	test('uses fleet membership without treating latest as an installed version', async () => {
		const root = await testTempDir('aidd-stack-fleet-');
		const project = join(root, 'pendingapp');
		const manifest = join(root, 'spernakit.psd1');
		try {
			await mkdir(project, { recursive: true });
			await writeFile(manifest, "'pendingapp' = @{ spernakit_version = 'latest' }", 'utf8');
			const stack = await detectProjectStack(project, { spernakitFleetManifest: manifest });
			expect(stack).toMatchObject({
				family: 'spernakit',
				label: 'Spernakit',
				source: 'fleet-manifest',
			});
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});

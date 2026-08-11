import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { gatherPorts } from '../../backend/src/services/projectMetadata.ts';

import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

interface ProjectFixture {
	files?: Record<string, string>;
	packageJson?: Record<string, unknown>;
}

async function withProject<T>(fixture: ProjectFixture, verify: (projectDir: string) => Promise<T>) {
	const projectDir = await testTempDir('aidd-project-port-discovery-');
	try {
		if (fixture.packageJson) {
			await writeFile(join(projectDir, 'package.json'), JSON.stringify(fixture.packageJson));
		}
		for (const [path, content] of Object.entries(fixture.files ?? {})) {
			const target = join(projectDir, path);
			await mkdir(join(target, '..'), { recursive: true });
			await writeFile(target, content);
		}
		return await verify(projectDir);
	} finally {
		await removeTempTree(projectDir);
	}
}

describe('project runtime port discovery', () => {
	test('keeps explicit config JSON ahead of package scripts', async () => {
		await withProject(
			{
				files: { 'config.json': JSON.stringify({ backendPort: 4100, frontendPort: 4101 }) },
				packageJson: { scripts: { dev: 'vite --port 5173' } },
			},
			async (projectDir) => {
				expect(await gatherPorts(projectDir)).toEqual({
					backendPort: 4100,
					frontendPort: 4101,
				});
			},
		);
	});

	test('detects a React/Vite frontend declaration', async () => {
		await withProject(
			{
				packageJson: {
					devDependencies: { vite: '7.0.0' },
					dependencies: { react: '19.0.0' },
					scripts: { dev: 'vite --host 0.0.0.0 --port 5173' },
				},
			},
			async (projectDir) => {
				expect(await gatherPorts(projectDir)).toEqual({
					backendPort: null,
					frontendPort: 5173,
				});
			},
		);
	});

	test('detects a Bun or Node backend declaration', async () => {
		await withProject(
			{
				packageJson: {
					scripts: { start: 'bun --watch src/server.ts --port 4100' },
				},
			},
			async (projectDir) => {
				expect(await gatherPorts(projectDir)).toEqual({
					backendPort: 4100,
					frontendPort: null,
				});
			},
		);
	});

	test('classifies delegated Bun scripts by their workspace or script target', async () => {
		await withProject(
			{
				packageJson: {
					dependencies: { elysia: '1.4.29', react: '19.0.0', vite: '7.0.0' },
					scripts: {
						api: 'bun run --cwd backend dev -- --port 4100',
						dev: 'bun run --cwd frontend dev -- --port 5173',
					},
				},
			},
			async (projectDir) => {
				expect(await gatherPorts(projectDir)).toEqual({
					backendPort: 4100,
					frontendPort: 5173,
				});
			},
		);
		await withProject(
			{
				packageJson: {
					dependencies: { elysia: '1.4.29', react: '19.0.0', vite: '7.0.0' },
					scripts: { dev: 'bun run dev:web -- --port 5174' },
				},
			},
			async (projectDir) => {
				expect(await gatherPorts(projectDir)).toEqual({
					backendPort: null,
					frontendPort: 5174,
				});
			},
		);
	});

	test('does not treat an ambiguous delegated Bun script as a backend', async () => {
		await withProject(
			{
				packageJson: {
					dependencies: { elysia: '1.4.29', react: '19.0.0', vite: '7.0.0' },
					scripts: { dev: 'bun run dev -- --port 5173' },
				},
			},
			async (projectDir) => {
				expect(await gatherPorts(projectDir)).toBeNull();
			},
		);
	});

	test('combines separate frontend and backend script declarations', async () => {
		await withProject(
			{
				packageJson: {
					scripts: {
						'backend:dev': 'node src/server.mjs --port=4100',
						dev: 'vite --port 5173',
					},
				},
			},
			async (projectDir) => {
				expect(await gatherPorts(projectDir)).toEqual({
					backendPort: 4100,
					frontendPort: 5173,
				});
			},
		);
	});

	test('uses allowlisted environment keys without exposing other values', async () => {
		await withProject(
			{
				files: { '.env.local': 'BACKEND_PORT=4100\nDATABASE_URL=secret://not-a-port\n' },
				packageJson: { scripts: {} },
			},
			async (projectDir) => {
				expect(await gatherPorts(projectDir)).toEqual({
					backendPort: 4100,
					frontendPort: null,
				});
			},
		);
	});

	test('returns null for invalid, ambiguous, and absent declarations', async () => {
		await withProject(
			{
				packageJson: {
					scripts: {
						dev: 'vite --port 0',
						start: 'node src/server.mjs --port 65536',
					},
				},
			},
			async (projectDir) => {
				expect(await gatherPorts(projectDir)).toBeNull();
			},
		);
		await withProject(
			{
				packageJson: {
					scripts: { dev: 'vite --port 5173', preview: 'vite --port 4173' },
				},
			},
			async (projectDir) => {
				expect(await gatherPorts(projectDir)).toBeNull();
			},
		);
		await withProject({ packageJson: { scripts: {} } }, async (projectDir) => {
			expect(await gatherPorts(projectDir)).toBeNull();
		});
	});
});

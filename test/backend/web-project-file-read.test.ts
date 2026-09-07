import { describe, expect, test } from 'bun:test';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WebContext } from '../../backend/src/context.ts';

import { createProjectsRoutes } from '../../backend/src/routes/projects.ts';
import { readProjectFile } from '../../backend/src/services/project/fileContent.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';
async function makeProject(): Promise<string> {
	const projectDir = await testTempDir('aidd-file-read-');
	await mkdir(join(projectDir, '.aidd', 'features'), { recursive: true });
	await writeFile(join(projectDir, '.aidd', 'spec.md'), '# Spec\n\nBody text.\n');
	await writeFile(join(projectDir, '.aidd', 'roadmap.json'), '{"milestones":[]}\n');
	await writeFile(join(projectDir, 'CONTEXT.md'), '# Context\n');
	await writeFile(join(projectDir, 'secret.txt'), 'do not serve\n');
	return projectDir;
}

describe('readProjectFile', () => {
	test('serves markdown and json artifacts under .aidd with detected kinds', async () => {
		const projectDir = await makeProject();
		try {
			const markdown = await readProjectFile(projectDir, '.aidd/spec.md');
			expect(markdown.state).toBe('ok');
			expect(markdown.kind).toBe('markdown');
			expect(markdown.content).toContain('# Spec');
			expect(markdown.path).toBe('.aidd/spec.md');

			const json = await readProjectFile(projectDir, '.aidd/roadmap.json');
			expect(json.state).toBe('ok');
			expect(json.kind).toBe('json');
			expect(json.content).toContain('milestones');
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('serves root-allowlisted CONTEXT.md but no other root files', async () => {
		const projectDir = await makeProject();
		try {
			const allowed = await readProjectFile(projectDir, 'CONTEXT.md');
			expect(allowed.state).toBe('ok');
			expect(allowed.content).toContain('# Context');

			const denied = await readProjectFile(projectDir, 'secret.txt');
			expect(denied.state).toBe('invalid-path');
			expect(denied.content).toBe('');
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('rejects traversal and absolute paths', async () => {
		const projectDir = await makeProject();
		try {
			for (const requested of [
				'../outside.txt',
				'.aidd/../secret.txt',
				'.aidd\\..\\secret.txt',
				'/etc/passwd',
				'C:/Windows/system.ini',
				'C:\\Windows\\system.ini',
				'',
				'.aidd/spec.md\0',
			]) {
				const result = await readProjectFile(projectDir, requested);
				expect(result.state).toBe('invalid-path');
			}
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('reports missing for nonexistent files and directories', async () => {
		const projectDir = await makeProject();
		try {
			const missing = await readProjectFile(projectDir, '.aidd/nope.md');
			expect(missing.state).toBe('missing');

			const dir = await readProjectFile(projectDir, '.aidd/features');
			expect(dir.state).toBe('missing');
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('head-caps files larger than the limit at a line boundary', async () => {
		const projectDir = await makeProject();
		try {
			const line = `${'x'.repeat(99)}\n`;
			await writeFile(join(projectDir, '.aidd', 'big.json'), line.repeat(11_000));
			const result = await readProjectFile(projectDir, '.aidd/big.json');
			expect(result.state).toBe('ok');
			expect(result.truncated).toBe(true);
			expect(result.totalBytes).toBe(1_100_000);
			expect(result.content.length).toBeLessThanOrEqual(1024 * 1024);
			expect(result.content.endsWith('\n')).toBe(true);
		} finally {
			await removeTempTree(projectDir);
		}
	});

	// File symlinks require Windows Developer Mode or elevated privileges; Linux CI runs this case.
	test.skipIf(process.platform === 'win32')(
		'rejects a symlink inside .aidd that escapes the project',
		async () => {
			const projectDir = await makeProject();
			const outsideDir = await testTempDir('aidd-file-read-outside-');
			try {
				await writeFile(join(outsideDir, 'escape.md'), 'outside content\n');
				await symlink(
					join(outsideDir, 'escape.md'),
					join(projectDir, '.aidd', 'escape.md'),
				);
				const result = await readProjectFile(projectDir, '.aidd/escape.md');
				expect(result.state).toBe('invalid-path');
			} finally {
				await removeTempTree(projectDir);
				await removeTempTree(outsideDir);
			}
		},
	);
});

describe('project file route', () => {
	test('serves an artifact through the projects route', async () => {
		const projectDir = await makeProject();
		try {
			const app = createProjectsRoutes({
				projectService: {
					resolveDiscoveredProject: async () => projectDir,
				},
			} as unknown as WebContext);
			const response = await app.handle(
				new Request(
					`http://localhost/api/v1/projects/some-id/file?path=${encodeURIComponent('.aidd/spec.md')}`,
				),
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				content: string;
				kind: string;
				state: string;
			};
			expect(body.state).toBe('ok');
			expect(body.kind).toBe('markdown');
			expect(body.content).toContain('# Spec');
		} finally {
			await removeTempTree(projectDir);
		}
	});

	test('rejects an empty path at the schema layer', async () => {
		const app = createProjectsRoutes({
			projectService: {
				resolveDiscoveredProject: async () => tmpdir(),
			},
		} as unknown as WebContext);
		const response = await app.handle(
			new Request('http://localhost/api/v1/projects/some-id/file?path='),
		);
		expect(response.status).toBe(422);
	});
});

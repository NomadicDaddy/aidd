import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { canonicalProjectPath, encodeProjectId } from '../../backend/src/paths.ts';
import { ProjectService } from '../../backend/src/services/projectService.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

let projectDir: string;

function serviceForFolder(): ProjectService {
	return new ProjectService({
		allowedOrigins: [],
		allowedRoots: [projectDir],
		allowRemote: false,
		autoChainLimit: 3,
		autoChainRuns: false,
		dataDir: resolve(process.cwd(), 'data'),
		hostname: '127.0.0.1',
		ignoredFolders: ['.git', 'node_modules'],
		maxConcurrentRuns: 2,
		maxConcurrentRunsPerProject: 2,
		port: 3210,
		showSpernakitProject: false,
		spernakitFleetManifest: null,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates: [],
		traceDataMovement: false,
		useWorktrees: false,
	});
}

/** Every path under `dir` with its bytes; a directory maps to null. */
async function snapshot(dir: string): Promise<Record<string, null | string>> {
	const entries = await readdir(dir, { recursive: true });
	const pairs = await Promise.all(
		entries.sort().map(async (entry): Promise<[string, null | string]> => {
			const path = join(dir, entry);
			const isDirectory = (await stat(path)).isDirectory();
			return [entry, isDirectory ? null : (await readFile(path)).toString('base64')];
		}),
	);
	return Object.fromEntries(pairs);
}

beforeEach(async () => {
	projectDir = canonicalProjectPath(await testTempDir('aidd-view-alone-'));
	await mkdir(join(projectDir, 'src'), { recursive: true });
	await writeFile(join(projectDir, 'src', 'index.ts'), 'export const app = 1;\n');
});

afterEach(async () => {
	await removeTempTree(projectDir);
});

describe('a folder with no .aidd, under a configured root', () => {
	test('the detail view answers 404 and leaves it byte-identical', async () => {
		const before = await snapshot(projectDir);

		const detail = serviceForFolder().getProjectDetail(encodeProjectId(projectDir));

		await expect(detail).rejects.toMatchObject({ status: 404 });
		expect(await snapshot(projectDir)).toEqual(before);
	});

	test('the project list omits it and leaves it byte-identical', async () => {
		const before = await snapshot(projectDir);

		const listed = await serviceForFolder().listProjects();

		expect(listed.projects).toEqual([]);
		expect(await snapshot(projectDir)).toEqual(before);
	});
});

describe('a folder that has .aidd', () => {
	test('any .aidd directory, even an empty one, is listed as a project', async () => {
		await mkdir(join(projectDir, '.aidd'));

		const listed = await serviceForFolder().listProjects();

		expect(listed.projects.map((project) => project.path)).toEqual([projectDir]);
	});

	test('the detail view rewrites its artifact cache', async () => {
		const cache = join(projectDir, '.aidd', '.artifacts-check.json');
		await mkdir(join(projectDir, '.aidd'));
		await writeFile(cache, '{"checkedAt":"stale"}\n');

		await serviceForFolder().getProjectDetail(encodeProjectId(projectDir));

		const written = JSON.parse(await readFile(cache, 'utf8')) as { checkedAt: string };
		expect(written.checkedAt).not.toBe('stale');
	});
});

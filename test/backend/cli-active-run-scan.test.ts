import { describe, expect, test } from 'bun:test';
import {
	createCliActiveRunRecord,
	readCliActiveRunRecords,
	writeCliActiveRunRecord,
} from 'aidd-shared/metadata/active-runs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { WebContext } from '../../backend/src/context.ts';

import { createRunsRoutes } from '../../backend/src/routes/runs.ts';
import {
	listCliActiveRuns,
	listCliActiveRunsForProject,
	scanCliActiveRunProjectDirs,
} from '../../backend/src/services/run/cliActiveRuns.ts';
import { WebSocketHub } from '../../backend/src/webSocketHub.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';

function activeRun(projectDir: string, id: string) {
	return createCliActiveRunRecord({
		backend: 'native',
		id,
		mode: 'coding',
		model: undefined,
		projectDir,
		provider: undefined,
		reasoningEffort: 'low',
	});
}

function scanContext(root: string, ignoredFolders: readonly string[] = []) {
	return {
		config: { web: { allowedRoots: [root], ignoredFolders } },
		hub: new WebSocketHub(),
	} as Parameters<typeof listCliActiveRuns>[0];
}

function sortedPaths(paths: readonly string[]): string[] {
	return [...paths].map((path) => resolve(path)).sort();
}

describe('CLI active-run project scan', () => {
	test('records a root project and still discovers child project heartbeat records', async () => {
		const root = await testTempDir('aidd-cli-active-root-project-');
		try {
			const child = join(root, 'child-project');
			const nestedProject = join(child, 'nested-project');
			const ignoredProject = join(root, 'ignored', 'project');
			await writeCliActiveRunRecord(activeRun(root, 'root_run'));
			await writeCliActiveRunRecord(activeRun(child, 'child_run'));
			await writeCliActiveRunRecord(activeRun(nestedProject, 'nested_run'));
			await writeCliActiveRunRecord(activeRun(ignoredProject, 'ignored_run'));

			const projectDirs = await scanCliActiveRunProjectDirs(root, ['ignored']);
			expect(sortedPaths(projectDirs)).toEqual(sortedPaths([root, child]));

			const records = (
				await Promise.all(
					projectDirs.map((projectDir) =>
						readCliActiveRunRecords(projectDir, { includeCompleted: true }),
					),
				)
			).flat();
			expect(records.map((record) => record.id).sort()).toEqual(['child_run', 'root_run']);
		} finally {
			await removeTempTree(root);
		}
	});

	test('descends from a root metadata directory that has no active-runs child', async () => {
		const root = await testTempDir('aidd-cli-metadata-root-');
		try {
			const child = join(root, 'child-project');
			await mkdir(join(root, '.aidd'), { recursive: true });
			await writeCliActiveRunRecord(activeRun(child, 'child_run'));

			const projectDirs = await scanCliActiveRunProjectDirs(root, []);
			expect(sortedPaths(projectDirs)).toEqual(sortedPaths([child]));
		} finally {
			await removeTempTree(root);
		}
	});

	test('preserves project branch termination, ignored folders, and the depth budget', async () => {
		const root = await testTempDir('aidd-cli-active-depth-');
		try {
			const depthTwoProject = join(root, 'group', 'depth-two-project');
			const nestedInProject = join(depthTwoProject, 'nested-project');
			const depthThreeProject = join(root, 'one', 'two', 'depth-three-project');
			const ignoredProject = join(root, 'ignored', 'project');
			await mkdir(join(root, '.aidd'), { recursive: true });
			await writeCliActiveRunRecord(activeRun(depthTwoProject, 'depth_two_run'));
			await writeCliActiveRunRecord(activeRun(nestedInProject, 'nested_run'));
			await writeCliActiveRunRecord(activeRun(depthThreeProject, 'depth_three_run'));
			await writeCliActiveRunRecord(activeRun(ignoredProject, 'ignored_run'));

			const projectDirs = await scanCliActiveRunProjectDirs(root, ['ignored']);
			expect(sortedPaths(projectDirs)).toEqual(sortedPaths([depthTwoProject]));
		} finally {
			await removeTempTree(root);
		}
	});

	test('global and project run routes agree on a child heartbeat below a root project', async () => {
		const root = await testTempDir('aidd-cli-active-routes-');
		try {
			const child = join(root, 'child-project');
			await writeCliActiveRunRecord(activeRun(root, 'root_run'));
			await writeCliActiveRunRecord(activeRun(child, 'child_run'));
			const context = scanContext(root);
			const app = createRunsRoutes({
				runService: {
					listRunsForProjectPage: async (projectPath: string) => ({
						items: await listCliActiveRunsForProject(projectPath),
						nextCursor: null,
					}),
					listRunsPage: async () => ({
						items: await listCliActiveRuns(context),
						nextCursor: null,
					}),
				},
			} as unknown as WebContext);

			const globalResponse = await app.handle(new Request('http://localhost/api/v1/runs'));
			const scopedResponse = await app.handle(
				new Request(
					`http://localhost/api/v1/runs?projectPath=${encodeURIComponent(child)}`,
				),
			);
			expect(globalResponse.status).toBe(200);
			expect(scopedResponse.status).toBe(200);
			const globalBody = (await globalResponse.json()) as {
				runs: { canKill: boolean; canStop: boolean; id: string; status: string }[];
			};
			const scopedBody = (await scopedResponse.json()) as typeof globalBody;
			const globalChild = globalBody.runs.find((run) => run.id === 'child_run');
			const scopedChild = scopedBody.runs.find((run) => run.id === 'child_run');
			expect(globalChild).toMatchObject({
				canKill: true,
				canStop: true,
				id: 'child_run',
				status: 'running',
			});
			expect(scopedChild).toEqual(globalChild);
		} finally {
			await removeTempTree(root);
		}
	});
});

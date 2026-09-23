import { mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import {
	appLaunches,
	diaryEntries,
	scheduledTaskProjects,
	scheduledTasks,
	settings,
} from '../../backend/src/db/schema.ts';
import { canonicalProjectPath, encodeProjectId } from '../../backend/src/paths.ts';
import {
	backfillProjectPathIdentity,
	PROJECT_PATH_IDENTITY_KEY,
	PROJECT_PATH_IDENTITY_VERSION,
} from '../../backend/src/services/outcome/projectPathIdentityBackfill.ts';
import { ProjectService } from '../../backend/src/services/projectService.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { outcomeDatabase as database } from './_helpers/outcome-analytics.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

const onWindows = process.platform === 'win32';

/** The same directory spelled the way a shell on a different drive-letter case would spell it. */
function otherSpelling(path: string): string {
	return onWindows ? path.charAt(0).toUpperCase() + path.slice(1).toUpperCase() : path;
}

function webProjectConfig(root: string) {
	return {
		allowRemote: false,
		allowedOrigins: [],
		allowedRoots: [root],
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
	};
}

async function projectFixture(): Promise<{ canonical: string; project: string; root: string }> {
	const root = await testTempDir('aidd-path-resolution-');
	const project = join(root, 'Mixed-Case');
	await mkdir(join(project, '.aidd'), { recursive: true });
	return { canonical: canonicalProjectPath(project), project, root };
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

describe('canonical project path at resolution', () => {
	test('lists a project under its canonical path and id whichever way the root is spelled', async () => {
		const { canonical, root } = await projectFixture();
		try {
			const service = new ProjectService(webProjectConfig(otherSpelling(root)));
			const { projects } = await service.listProjects();
			const listed = projects.find((project) => project.name === 'Mixed-Case');
			expect(listed?.path).toBe(canonical);
			expect(listed?.id).toBe(encodeProjectId(canonical));
			expect(await service.resolveProjectPath(otherSpelling(canonical))).toBe(canonical);
		} finally {
			await removeTempTree(root);
		}
	});

	test('accepts a delete confirmation spelled with the other drive letter case', async () => {
		const { canonical, project, root } = await projectFixture();
		try {
			const service = new ProjectService(webProjectConfig(root));
			await expect(
				service.deleteProject(
					encodeProjectId(project),
					{ confirmation: join(root, 'Other-Project'), mode: 'metadata' },
					async () => false,
					async () => 0,
				),
			).rejects.toThrow('Project path confirmation does not match');
			await service.deleteProject(
				encodeProjectId(project),
				{ confirmation: otherSpelling(canonical), mode: 'metadata' },
				async () => false,
				async () => 0,
			);
			expect(await pathExists(project)).toBe(true);
			expect(await pathExists(join(project, '.aidd'))).toBe(false);
		} finally {
			await removeTempTree(root);
		}
	});
});

describe('project path identity backfill version 2', () => {
	test('rewrites the project-scoped tables, resolves twins, and reruns over a version 1 flag', async () => {
		const { db, sqlite } = database();
		const { canonical, root } = await projectFixture();
		try {
			// Case variants are distinct identities on POSIX; the fixture must insert two keys.
			const other = onWindows ? otherSpelling(canonical) : `${canonical}-other`;
			await db.insert(settings).values({
				key: PROJECT_PATH_IDENTITY_KEY,
				value: JSON.stringify({ completedAt: 1, cursorsRemoved: 0, rewritten: 0 }),
			});
			await db.insert(diaryEntries).values({
				bodyMd: '# day',
				contentHash: 'c'.repeat(64),
				entryDate: '2026-08-25',
				fileMtimeMs: 1,
				filePath: join(other, '.aidd', 'diary', '2026-08-25.md'),
				id: 'diary-other',
				indexedAt: 1,
				projectName: 'Mixed-Case',
				projectPath: other,
				title: 'Day',
			});
			await db.insert(appLaunches).values([
				{
					command: 'bun run dev',
					projectPath: canonical,
					status: 'stopped',
					updatedAt: 10,
				},
				{
					command: 'bun run start',
					pid: 42,
					projectPath: other,
					status: 'running',
					updatedAt: 20,
				},
			]);
			await db.insert(scheduledTasks).values({
				createdAt: 1,
				id: 'task-1',
				name: 'Task',
				nextRunAt: 100,
				projectScope: 'explicit',
				scheduleExpression: '* * * * *',
				scheduleKind: 'cron',
				state: 'active',
				targetJson: '{"type":"recipe","recipeId":"r","applyChanges":false}',
				targetType: 'recipe',
				timezone: 'UTC',
				updatedAt: 1,
			});
			await db.insert(scheduledTaskProjects).values([
				{ projectPath: canonical, taskId: 'task-1' },
				{ projectPath: other, taskId: 'task-1' },
			]);

			const summary = await backfillProjectPathIdentity(db);
			expect(summary).toEqual({
				cursorsRemoved: 0,
				duplicatesRemoved: onWindows ? 2 : 0,
				rewritten: onWindows ? 2 : 0,
				skipped: false,
			});

			const diary = await db
				.select({ projectPath: diaryEntries.projectPath })
				.from(diaryEntries)
				.where(eq(diaryEntries.id, 'diary-other'));
			expect(diary[0]?.projectPath).toBe(onWindows ? canonical : other);

			const launches = await db
				.select({ command: appLaunches.command, projectPath: appLaunches.projectPath })
				.from(appLaunches);
			if (onWindows) {
				expect(launches).toEqual([{ command: 'bun run start', projectPath: canonical }]);
			} else {
				expect(launches).toHaveLength(2);
			}

			const pinned = await db
				.select({ projectPath: scheduledTaskProjects.projectPath })
				.from(scheduledTaskProjects)
				.where(eq(scheduledTaskProjects.taskId, 'task-1'));
			expect(pinned.map((row) => row.projectPath)).toEqual(
				onWindows ? [canonical] : [canonical, other],
			);

			const flag = await db
				.select({ value: settings.value })
				.from(settings)
				.where(eq(settings.key, PROJECT_PATH_IDENTITY_KEY));
			expect(JSON.parse(flag[0]?.value ?? '{}').version).toBe(PROJECT_PATH_IDENTITY_VERSION);
			expect((await backfillProjectPathIdentity(db)).skipped).toBe(true);
		} finally {
			sqlite.close();
			await removeTempTree(root);
		}
	});
});

// A path one segment short of the intended project resolves to the configured root, which
// assertAllowedPath accepts exactly. A run launched there scaffolds .aidd/ and the root contract
// across the whole fleet directory, so the root is refused unless it is itself a project.
describe('bare allowed root as a launch target', () => {
	test('refuses a configured root that holds projects', async () => {
		const { root } = await projectFixture();
		try {
			const service = new ProjectService(webProjectConfig(root));
			await expect(service.resolveProjectPath(root)).rejects.toThrow(
				'is a configured project root, not a project',
			);
			await expect(service.resolveProjectPath(otherSpelling(root))).rejects.toThrow(
				'is a configured project root, not a project',
			);
		} finally {
			await removeTempTree(root);
		}
	});

	test('still resolves a project inside that root', async () => {
		const { canonical, project, root } = await projectFixture();
		try {
			const service = new ProjectService(webProjectConfig(root));
			expect(await service.resolveProjectPath(project)).toBe(canonical);
		} finally {
			await removeTempTree(root);
		}
	});

	// Pointing a root straight at one project is a supported setup; its own .aidd/ is what tells
	// that case apart from the fleet root.
	test('accepts a root that is itself a project', async () => {
		const root = await testTempDir('aidd-single-project-root-');
		try {
			await mkdir(join(root, '.aidd'), { recursive: true });
			const service = new ProjectService(webProjectConfig(root));
			expect(await service.resolveProjectPath(root)).toBe(canonicalProjectPath(root));
		} finally {
			await removeTempTree(root);
		}
	});
});

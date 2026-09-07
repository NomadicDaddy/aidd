import { Database } from 'bun:sqlite';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'bun:test';

import { type WebDatabase, wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import {
	directorCycles,
	invocationEvents,
	pipelineSessions,
	runs,
} from '../../backend/src/db/schema.ts';
import { listTimelinePage } from '../../backend/src/services/diary/timeline.ts';

import { testTempDir } from '../_helpers/temp.ts';
const PROJECT = 'd:/applications/demo';
const NO_RELEASES = '/tmp/diary-timeline-no-changelog';

let db: WebDatabase;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	db = wrapWebDatabase(sqlite).db;
});

function seedRun(
	id: string,
	startedAt: number,
	overrides: Partial<typeof runs.$inferInsert> = {},
): Promise<unknown> {
	return db.insert(runs).values({
		backend: 'native',
		id,
		mode: 'coding',
		projectName: 'demo',
		projectPath: PROJECT,
		source: 'web',
		startedAt,
		status: 'completed',
		...overrides,
	});
}

function seedSkillInvocation(
	id: string,
	startedAt: number,
	runId: null | string,
): Promise<unknown> {
	return db.insert(invocationEvents).values({
		id,
		projectName: 'demo',
		projectPath: PROJECT,
		resourceId: 'diary-entry',
		resourceName: 'Diary Entry',
		resourceType: 'skill',
		runId,
		source: 'web',
		startedAt,
		status: 'completed',
	});
}

function seedSession(id: string, recipeId: string, startedAt: number): Promise<unknown> {
	return db.insert(pipelineSessions).values({
		id,
		parametersJson: '{}',
		projectName: 'demo',
		projectPath: PROJECT,
		recipeId,
		recipeName: recipeId,
		startedAt,
		status: 'completed',
		totalSteps: 1,
	});
}

function seedCycle(id: string, startedAt: number): Promise<unknown> {
	return db.insert(directorCycles).values({ id, startedAt, status: 'completed' });
}

describe('listTimelinePage', () => {
	test('returns sources newest-first', async () => {
		await seedRun('run_a', 3000);
		await seedSession('sess_r', 'my-recipe', 1500);
		await seedCycle('cyc', 1000);
		const page = await listTimelinePage({ db, rootDir: NO_RELEASES });
		expect(page.items.map((item) => item.id)).toEqual(['run_a', 'sess_r', 'cyc']);
	});

	test('carries authoritative outcome inputs for runs without deriving a display label', async () => {
		await seedRun('run_no_work', 3000, {
			exitCode: 0,
			stopReason: 'no_work',
			summary: 'No approved incomplete coding features are available',
		});
		const page = await listTimelinePage({ db, rootDir: NO_RELEASES });

		expect(page.items[0]?.runOutcome).toEqual({
			exitCode: 0,
			status: 'completed',
			stopReason: 'no_work',
			summary: 'No approved incomplete coding features are available',
		});
		expect(page.items[0]?.status).toBe('completed');
	});

	test('suppresses the run row a web-launched skill produced', async () => {
		await seedRun('run_ing', 2000);
		await seedSkillInvocation('inv_ing', 2000, 'run_ing');
		const page = await listTimelinePage({ db, rootDir: NO_RELEASES });
		const ids = page.items.map((item) => item.id);
		expect(ids).toContain('inv_ing');
		expect(ids).not.toContain('run_ing');
	});

	test('excludes skill: wrapper sessions (represented by their invocation)', async () => {
		await seedSession('sess_r', 'my-recipe', 1500);
		await seedSession('sess_i', 'skill:diary-entry', 1400);
		const page = await listTimelinePage({ db, rootDir: NO_RELEASES });
		const ids = page.items.map((item) => item.id);
		expect(ids).toContain('sess_r');
		expect(ids).not.toContain('sess_i');
	});

	test('includes director cycles only on the global feed', async () => {
		await seedRun('run_a', 3000);
		await seedCycle('cyc', 1000);
		const global = await listTimelinePage({ db, rootDir: NO_RELEASES });
		expect(global.items.map((item) => item.id)).toContain('cyc');
		const scoped = await listTimelinePage(
			{ db, rootDir: NO_RELEASES },
			{ projectPath: PROJECT },
		);
		expect(scoped.items.map((item) => item.id)).not.toContain('cyc');
	});

	test('scopes to a project regardless of slash/casing', async () => {
		await seedRun('run_a', 3000);
		await db.insert(runs).values({
			backend: 'native',
			id: 'run_other',
			mode: 'coding',
			projectName: 'other',
			projectPath: 'd:/applications/other',
			source: 'web',
			startedAt: 2500,
			status: 'completed',
		});
		// win32 folds path case; POSIX comparison is case-sensitive by design
		// (projectPathFilterFor), so off-Windows use case-matching input to still
		// exercise slash-insensitivity (backslash query vs forward-slash seed).
		const queryPath =
			process.platform === 'win32' ? 'D:\\applications\\Demo' : 'd:\\applications\\demo';
		const page = await listTimelinePage(
			{ db, rootDir: NO_RELEASES },
			{ projectPath: queryPath },
		);
		const ids = page.items.map((item) => item.id);
		expect(ids).toContain('run_a');
		expect(ids).not.toContain('run_other');
	});

	test('pages by cursor without dropping or duplicating items', async () => {
		for (let i = 0; i < 5; i++) await seedRun(`run_${i}`, 1000 + i * 100);
		const first = await listTimelinePage({ db, rootDir: NO_RELEASES }, { limit: 2 });
		expect(first.items).toHaveLength(2);
		expect(first.nextCursor).not.toBeNull();
		const second = await listTimelinePage(
			{ db, rootDir: NO_RELEASES },
			{ ...(first.nextCursor ? { cursor: first.nextCursor } : {}), limit: 2 },
		);
		const seen = new Set([...first.items, ...second.items].map((item) => item.id));
		expect(seen.size).toBe(4);
	});

	test('surfaces CHANGELOG releases on the first global page only', async () => {
		const root = await testTempDir('diary-rel-');
		await mkdir(join(root, '.aidd'), { recursive: true });
		const sameDay = Array.from(
			{ length: 12 },
			(_, index) => `## [2026-06-12] - Same-day release ${index + 1}`,
		).join('\n\nnotes\n\n');
		await writeFile(
			join(root, '.aidd', 'CHANGELOG.md'),
			`## [2026-06-13] - Newer day\n\nnotes\n\n${sameDay}\n\nnotes\n\n## [2026-06-11] - Older day\n`,
		);
		const page = await listTimelinePage({ db, rootDir: root });
		const releases = page.items.filter((item) => item.kind === 'release');
		expect(releases.map((release) => release.title)).toEqual([
			'Newer day',
			...Array.from({ length: 12 }, (_, index) => `Same-day release ${index + 1}`),
			'Older day',
		]);
		// Not on a cursor-driven page.
		const next = await listTimelinePage({ db, rootDir: root }, { cursor: 'abc' });
		expect(next.items.some((item) => item.kind === 'release')).toBe(false);
	});
});

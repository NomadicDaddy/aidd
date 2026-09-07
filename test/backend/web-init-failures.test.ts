import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';

import type { WebContext } from '../../backend/src/context.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { createProjectInitFailureRoutes } from '../../backend/src/routes/projectInitFailures.ts';
import { ProjectInitFailureService } from '../../backend/src/services/project/initFailureService.ts';
import {
	dismissInitFailure,
	getInitFailureLogPath,
	getOpenInitFailure,
	listOpenInitFailures,
	recordInitFailure,
} from '../../backend/src/services/project/initFailures.ts';

function freshDb() {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	return { db: wrapWebDatabase(sqlite).db, sqlite };
}

const SAMPLE = {
	description: 'A broken scaffold',
	errorSummary: 'Template "spernakit" init failed with exit code 1.',
	logPath: 'D:/data/run-logs/spernakit-init-123.log',
	name: 'broken-app',
	quarantinePath: 'D:/apps/broken-app.failed-123',
	root: 'D:/apps',
	targetPath: 'D:/apps/broken-app',
	template: 'spernakit',
	templateUrl: null,
};

describe('project init failures', () => {
	test('records, lists, exposes log path, and resolves a single open failure', async () => {
		const { db, sqlite } = freshDb();
		try {
			await recordInitFailure(db, SAMPLE);
			const open = await listOpenInitFailures(db);
			expect(open).toHaveLength(1);
			expect(open[0]).toMatchObject({
				description: 'A broken scaffold',
				errorSummary: SAMPLE.errorSummary,
				hasLog: true,
				name: 'broken-app',
				quarantinePath: SAMPLE.quarantinePath,
				root: 'D:/apps',
				targetPath: 'D:/apps/broken-app',
				template: 'spernakit',
			});
			const id = open[0]!.id;
			expect(await getInitFailureLogPath(db, id)).toBe(SAMPLE.logPath);
			expect(await getOpenInitFailure(db, id)).toBeDefined();
		} finally {
			sqlite.close();
		}
	});

	test('dismiss removes the failure from the open list and is idempotent', async () => {
		const { db, sqlite } = freshDb();
		try {
			await recordInitFailure(db, SAMPLE);
			const id = (await listOpenInitFailures(db))[0]!.id;

			expect(await dismissInitFailure(db, id)).toBe(true);
			expect(await listOpenInitFailures(db)).toHaveLength(0);
			expect(await getOpenInitFailure(db, id)).toBeUndefined();
			// Second dismiss is a no-op (already dismissed → not in the open set).
			expect(await dismissInitFailure(db, id)).toBe(false);
		} finally {
			sqlite.close();
		}
	});

	test('a github-template failure round-trips its retryable source', async () => {
		const { db, sqlite } = freshDb();
		try {
			await recordInitFailure(db, {
				...SAMPLE,
				template: 'github:owner/repo',
				templateUrl: 'owner/repo#v2',
			});
			const open = await listOpenInitFailures(db);
			expect(open[0]?.template).toBe('github:owner/repo');
			// The parseable source (ref included) is what the retry route forwards.
			expect(open[0]?.templateUrl).toBe('owner/repo#v2');
		} finally {
			sqlite.close();
		}
	});

	test('retry forwards a github failure as templateUrl, not a registry template name', async () => {
		const { db, sqlite } = freshDb();
		try {
			const failureService = new ProjectInitFailureService(db);
			await failureService.record({
				...SAMPLE,
				template: 'github:owner/repo',
				templateUrl: 'owner/repo#v2',
			});
			const id = (await failureService.listOpen())[0]!.id;

			const captured: { template?: string; templateUrl?: string }[] = [];
			const context = {
				initFailureService: failureService,
				pipelineService: {
					launchRecipe: () => Promise.resolve({ id: 'intake-1' }),
				},
				projectService: {
					createProject: (input: { template?: string; templateUrl?: string }) => {
						captured.push(input);
						return Promise.resolve({
							intakeSessionId: 'intake-1',
							mode: 'fresh',
							path: SAMPLE.targetPath,
							projectId: 'p1',
							runId: null,
						});
					},
				},
				runService: {
					launchRun: () => Promise.resolve({ id: 'run-1' }),
					purgeProjectRuns: () => Promise.resolve(0),
				},
			} as unknown as WebContext;
			const app = createProjectInitFailureRoutes(context);

			const response = await app.handle(
				new Request(`http://127.0.0.1:3210/api/v1/projects/init-failures/${id}/retry`, {
					method: 'POST',
				}),
			);

			expect(response.status).toBe(200);
			// The pseudo-name 'github:owner/repo' is not a registry entry: retrying by name
			// would 400 with "Unknown project template". The persisted source must win.
			expect(captured).toHaveLength(1);
			expect(captured[0]?.templateUrl).toBe('owner/repo#v2');
			expect(captured[0]?.template).toBeUndefined();
			// A successful retry dismisses the failure.
			expect(await failureService.listOpen()).toHaveLength(0);
		} finally {
			sqlite.close();
		}
	});

	test('hasLog is false when no log path was captured (spawn-error path)', async () => {
		const { db, sqlite } = freshDb();
		try {
			await recordInitFailure(db, { ...SAMPLE, logPath: null, quarantinePath: null });
			const open = await listOpenInitFailures(db);
			expect(open[0]?.hasLog).toBe(false);
			expect(open[0]?.quarantinePath).toBeNull();
		} finally {
			sqlite.close();
		}
	});
});

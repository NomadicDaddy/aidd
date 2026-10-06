import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { pipelineSessions, runs } from '../../backend/src/db/schema.ts';

// Only the Director's auto-launcher checked whether a project was busy. Every other path (the
// Recipes page, a schedule, a skill, onboarding) started a second session beside a first, or beside
// a run, in the same live tree, and the metadata write guard then failed a step for the other
// writer's changes. The claim is one transaction: the check and the insert cannot be split.

const PROJECT = 'd:/applications/demo';

function harness() {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	return { sqlite, ...wrapWebDatabase(sqlite) };
}

function session(id: string, status = 'queued') {
	return {
		currentStepIndex: 0,
		id,
		parametersJson: '{}',
		projectName: 'demo',
		projectPath: PROJECT,
		recipeId: 'r',
		recipeName: 'r',
		startedAt: Date.now(),
		status,
		totalSteps: 1,
	};
}

describe('startPipelineSessionIfProjectIdle', () => {
	test('a second session on a project with an active one is refused', async () => {
		const { commands, sqlite } = harness();
		try {
			expect(
				await commands.startPipelineSessionIfProjectIdle({ values: session('ps_a') }),
			).toEqual({
				kind: 'started',
			});
			expect(
				await commands.startPipelineSessionIfProjectIdle({ values: session('ps_b') }),
			).toEqual({
				activeId: 'ps_a',
				activeKind: 'session',
				kind: 'busy',
			});
			expect(sqlite.query('SELECT id FROM pipeline_sessions').all()).toEqual([
				{ id: 'ps_a' },
			]);
		} finally {
			sqlite.close();
		}
	});

	test('an active run in the project refuses a session too', async () => {
		const { commands, db, sqlite } = harness();
		try {
			await db.insert(runs).values({
				backend: 'codex',
				id: 'run_live',
				mode: 'coding',
				projectName: 'demo',
				projectPath: PROJECT,
				source: 'web',
				startedAt: Date.now(),
				status: 'running',
			});
			expect(
				await commands.startPipelineSessionIfProjectIdle({ values: session('ps_c') }),
			).toEqual({
				activeId: 'run_live',
				activeKind: 'run',
				kind: 'busy',
			});
		} finally {
			sqlite.close();
		}
	});

	test('finished work, or another project, does not hold a project', async () => {
		const { commands, db, sqlite } = harness();
		try {
			await db.insert(pipelineSessions).values(session('ps_done', 'completed'));
			await db.insert(pipelineSessions).values({
				...session('ps_other'),
				projectPath: 'd:/applications/other',
			});
			expect(
				await commands.startPipelineSessionIfProjectIdle({ values: session('ps_d') }),
			).toEqual({
				kind: 'started',
			});
		} finally {
			sqlite.close();
		}
	});
});

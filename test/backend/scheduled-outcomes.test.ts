import { Database } from 'bun:sqlite';

import { beforeEach, describe, expect, test } from 'bun:test';

import type { WebDatabase } from '../../backend/src/db/client.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { directorCycles, pipelineSessions, runs } from '../../backend/src/db/schema.ts';
import { aggregateExecutionStatus } from '../../backend/src/services/scheduled/outcomes.ts';

let db: WebDatabase;

beforeEach(() => {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	db = wrapWebDatabase(sqlite).db;
});

async function aggregate() {
	return aggregateExecutionStatus({
		cycles: await db.select().from(directorCycles),
		dispatchErrors: [],
		runs: await db.select().from(runs),
		sessions: await db.select().from(pipelineSessions),
	});
}

describe('scheduled execution outcome aggregation', () => {
	test.each([
		['completed', 'completed'],
		['waiting_approval', 'completed_with_failures'],
		['failed', 'failed'],
		['killed', 'failed'],
		['stopped', 'failed'],
		['running', 'running'],
	] as const)('maps run %s to %s', async (status, expected) => {
		await db.insert(runs).values({
			backend: 'codex',
			id: `run-${status}`,
			projectName: 'project',
			projectPath: 'D:/project',
			source: 'scheduled',
			startedAt: 1,
			status,
		});
		expect(await aggregate()).toBe(expected);
	});

	test.each([
		['completed', 'completed'],
		['completed_with_failures', 'completed_with_failures'],
		['failed', 'failed'],
		['stopped', 'failed'],
		['queued', 'running'],
		['running', 'running'],
	] as const)('maps pipeline %s to %s', async (status, expected) => {
		await db.insert(pipelineSessions).values({
			id: `session-${status}`,
			parametersJson: '{}',
			projectName: 'project',
			projectPath: 'D:/project',
			recipeId: 'recipe',
			recipeName: 'Recipe',
			startedAt: 1,
			status,
			totalSteps: 1,
		});
		expect(await aggregate()).toBe(expected);
	});

	// The Director's fast path writes a cycle row and never a run row, so a director occurrence's
	// only child is the cycle. Without this mapping every such occurrence finalizes as failed.
	test.each([
		['completed', 'completed'],
		['failed', 'failed'],
		['running', 'running'],
	] as const)('maps director cycle %s to %s', async (status, expected) => {
		await db.insert(directorCycles).values({
			id: `cycle-${status}`,
			startedAt: 1,
			status,
		});
		expect(await aggregate()).toBe(expected);
	});

	test('treats dispatch-only failure as failed and partial dispatch as attention', async () => {
		expect(
			aggregateExecutionStatus({
				cycles: [],
				dispatchErrors: ['rejected'],
				runs: [],
				sessions: [],
			}),
		).toBe('failed');
		const completed = {
			...(
				await db
					.insert(runs)
					.values({
						backend: 'codex',
						id: 'run-completed',
						projectName: 'project',
						projectPath: 'D:/project',
						startedAt: 1,
						status: 'completed',
					})
					.returning()
			)[0]!,
		};
		expect(
			aggregateExecutionStatus({
				cycles: [],
				dispatchErrors: ['one project rejected'],
				runs: [completed],
				sessions: [],
			}),
		).toBe('completed_with_failures');
	});
});

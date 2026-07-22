import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';

function makeCommands() {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	return wrapWebDatabase(sqlite).commands;
}

function runValues(id: string, projectPath: string) {
	return {
		backend: 'native',
		id,
		mode: 'coding',
		projectName: 'proj',
		projectPath,
		source: 'web',
		startedAt: Date.now(),
		status: 'running',
	};
}

const args = (
	id: string,
	projectPath: string,
	maxConcurrentRuns: number,
	maxConcurrentRunsPerProject: number
) => ({ maxConcurrentRuns, maxConcurrentRunsPerProject, values: runValues(id, projectPath) });

describe('insertRunIfUnderCeiling', () => {
	test('enforces the per-project ceiling even when the global pool has room', async () => {
		const commands = makeCommands();
		expect((await commands.insertRunIfUnderCeiling(args('r1', '/proj/a', 10, 2))).kind).toBe(
			'inserted'
		);
		expect((await commands.insertRunIfUnderCeiling(args('r2', '/proj/a', 10, 2))).kind).toBe(
			'inserted'
		);
		// Third run on the same project hits the per-project cap (global still has 8 free).
		expect(await commands.insertRunIfUnderCeiling(args('r3', '/proj/a', 10, 2))).toMatchObject({
			kind: 'rejected',
			limit: 2,
			scope: 'project',
		});
		// A different project still has room.
		expect((await commands.insertRunIfUnderCeiling(args('r4', '/proj/b', 10, 2))).kind).toBe(
			'inserted'
		);
	});

	test('enforces the global ceiling across projects', async () => {
		const commands = makeCommands();
		expect((await commands.insertRunIfUnderCeiling(args('r1', '/proj/a', 1, 5))).kind).toBe(
			'inserted'
		);
		expect(await commands.insertRunIfUnderCeiling(args('r2', '/proj/b', 1, 5))).toMatchObject({
			kind: 'rejected',
			limit: 1,
			scope: 'global',
		});
	});
});

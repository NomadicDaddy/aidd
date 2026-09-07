import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';

import type { DirectorSuggestion } from 'aidd-shared';

import type { WebDatabase } from '../../backend/src/db/client.ts';
import type { DbCommands } from '../../backend/src/db/commands/types.ts';
import type { DirectorPrioritizedWork } from '../../backend/src/services/director/priority/types.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { directorCycles, suggestions } from '../../backend/src/db/schema.ts';
import { stampSuggestionRanks } from '../../backend/src/services/director/suggestionRank.ts';
import { DirectorSuggestionService } from '../../backend/src/services/director/suggestionService.ts';

/**
 * Rank persistence, required by `.aidd/features/suggestion-rank-persistence/feature.json`.
 *
 * Before this, "the top suggestion" was an accident of insertion order: every suggestion from one
 * cycle shares `createdAt` to the millisecond, so ordering by `createdAt` alone left ties to
 * SQLite's scan order, and nothing could pick work automatically on that basis. These tests pin
 * the three things that make the order mean something — the rank is carried over from the work
 * list the cycle was handed, it is never invented where no such ancestor exists, and the read
 * order is total.
 */

function work(overrides: Partial<DirectorPrioritizedWork>): DirectorPrioritizedWork {
	return {
		evidence: {},
		projectId: 'agentwatch',
		rank: 1,
		reason: 'because',
		riskLevel: 'LOW',
		suggestedArgs: null,
		suggestedRecipe: null,
		taskType: 'artifact_maintenance',
		title: 'agentwatch: reconcile aidd artifacts',
		...overrides,
	};
}

function suggestion(overrides: Partial<DirectorSuggestion>): DirectorSuggestion {
	return {
		description: 'd',
		evidence: {},
		projectId: 'agentwatch',
		reasoning: 'r',
		riskLevel: 'LOW',
		suggestedArgs: null,
		suggestedRecipe: null,
		taskType: 'artifact_maintenance',
		title: 'agentwatch: reconcile aidd artifacts',
		...overrides,
	};
}

describe('stampSuggestionRanks', () => {
	test('carries the rank of the prioritized-work item the suggestion is about', () => {
		const stamped = stampSuggestionRanks(
			[suggestion({ projectId: 'starsync', taskType: 'audit_backlog' }), suggestion({})],
			[work({}), work({ projectId: 'starsync', rank: 2, taskType: 'audit_backlog' })],
		);
		expect(stamped.map((entry) => entry.rank)).toEqual([2, 1]);
	});

	test('distinguishes two items in the same bucket by the artifact they name', () => {
		// The identity includes the targeted artifact, so per-feature work inside one bucket does
		// not collapse onto a single rank the way the (project, taskType) pair alone would.
		const stamped = stampSuggestionRanks(
			[
				suggestion({ suggestedArgs: { feature: 'beta' } }),
				suggestion({ suggestedArgs: { feature: 'alpha' } }),
			],
			[
				work({ rank: 1, suggestedArgs: { feature: 'alpha' } }),
				work({ rank: 2, suggestedArgs: { feature: 'beta' } }),
			],
		);
		expect(stamped.map((entry) => entry.rank)).toEqual([2, 1]);
	});

	test('leaves a model-authored suggestion with no prioritized-work ancestor null', () => {
		const stamped = stampSuggestionRanks(
			[suggestion({ projectId: 'invented', title: 'something the model thought of' })],
			[work({})],
		);
		expect(stamped[0]?.rank).toBeNull();
	});

	test('refuses to rank an aggregate rollup', () => {
		// A "+ N more" item is not a runnable next action. Ranking it would invite the
		// auto-launcher to pick the summary instead of the work.
		const stamped = stampSuggestionRanks(
			[suggestion({})],
			[work({ evidence: { rolledUp: 4 } })],
		);
		expect(stamped[0]?.rank).toBeNull();
	});

	test('records an ambiguous identity as null rather than letting one writer win', () => {
		const stamped = stampSuggestionRanks(
			[suggestion({})],
			[work({ rank: 1 }), work({ rank: 5 })],
		);
		expect(stamped[0]?.rank).toBeNull();
	});
});

function memoryDb(): { commands: DbCommands; db: WebDatabase; sqlite: Database } {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	return { ...wrapWebDatabase(sqlite), sqlite };
}

/**
 * `listSuggestions` reads the database and nothing else; the remaining collaborators exist only to
 * satisfy the constructor, so a call into one of them would be a test bug, not a stub gap.
 */
function reader(db: WebDatabase): DirectorSuggestionService {
	const absent = null as unknown as never;
	return new DirectorSuggestionService(db, absent, absent, absent);
}

describe('rank survives the cycle, the row, and the read', () => {
	test('persistCycleResult writes the stamped rank, and null where there is none', async () => {
		const { commands, db, sqlite } = memoryDb();
		try {
			const now = Date.now();
			await db.insert(directorCycles).values({ id: 'c1', startedAt: now, status: 'running' });
			const stamped = stampSuggestionRanks(
				[
					suggestion({ title: 'ranked' }),
					suggestion({
						projectId: 'starsync',
						taskType: 'audit_backlog',
						title: 'rolled up',
					}),
				],
				[
					work({}),
					work({
						evidence: { rolledUp: 3 },
						projectId: 'starsync',
						rank: 2,
						taskType: 'audit_backlog',
					}),
				],
			);
			const outcome = await commands.persistCycleResult({
				createdAt: now,
				cycleId: 'c1',
				cycleUpdate: {
					completedAt: now,
					failureReason: null,
					fleetHealthScore: 90,
					status: 'completed',
					totalSuggestions: 2,
				},
				dedupWindowMs: 0,
				suggestions: stamped,
			});
			expect(outcome.inserted).toBe(2);

			const byTitle = new Map(
				(await reader(db).listSuggestions()).map((row) => [row.title, row.rank]),
			);
			expect(byTitle.get('ranked')).toBe(1);
			expect(byTitle.get('rolled up')).toBeNull();
		} finally {
			sqlite.close();
		}
	});
});

describe('listSuggestions ordering', () => {
	async function seed(
		db: WebDatabase,
		rows: { id: string; rank: null | number }[],
	): Promise<void> {
		const now = 1_700_000_000_000;
		await db.insert(directorCycles).values({ id: 'c1', startedAt: now, status: 'completed' });
		await db.insert(suggestions).values(
			rows.map((row) => ({
				createdAt: now,
				cycleId: 'c1',
				description: 'd',
				evidence: '{}',
				id: row.id,
				projectId: 'agentwatch',
				rank: row.rank,
				reasoning: 'r',
				riskLevel: 'LOW',
				status: 'pending',
				taskType: 'artifact_maintenance',
				title: row.id,
			})),
		);
	}

	test('orders by rank within a cycle and sorts unranked rows last', async () => {
		const { db, sqlite } = memoryDb();
		try {
			// Historical rows carry no rank: the column did not exist when they were written and
			// nothing back-fills them. They have to land at the end rather than at the front,
			// which is where SQLite puts NULL when the ordering does not say otherwise.
			await seed(db, [
				{ id: 'c', rank: 3 },
				{ id: 'historical', rank: null },
				{ id: 'a', rank: 1 },
				{ id: 'b', rank: 2 },
			]);
			const rows = await reader(db).listSuggestions();
			expect(rows.map((row) => row.id)).toEqual(['a', 'b', 'c', 'historical']);
		} finally {
			sqlite.close();
		}
	});

	test('is total, so repeated reads come back in the same order', async () => {
		const { db, sqlite } = memoryDb();
		try {
			// Every row here ties on createdAt, and two pairs tie on rank as well. Without the id
			// tiebreaker the remainder would be scan order, which is what made "the top
			// suggestion" meaningless in the first place.
			await seed(db, [
				{ id: 'sug_4', rank: null },
				{ id: 'sug_1', rank: 1 },
				{ id: 'sug_3', rank: null },
				{ id: 'sug_2', rank: 1 },
			]);
			const service = reader(db);
			const first = (await service.listSuggestions()).map((row) => row.id);
			const second = (await service.listSuggestions()).map((row) => row.id);
			expect(first).toEqual(['sug_1', 'sug_2', 'sug_3', 'sug_4']);
			expect(second).toEqual(first);
		} finally {
			sqlite.close();
		}
	});
});

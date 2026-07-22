import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import type { DirectorProfileRecord } from 'aidd-shared';
import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { directorCycles, suggestions } from '../../backend/src/db/schema.ts';
import { buildDirectCyclePrompt } from '../../backend/src/services/director/directCycleNormalizer.ts';
import { readRecentSuggestionHistory } from '../../backend/src/services/director/suggestionHistory.ts';
import type { FleetSummary } from '../../backend/src/services/director/types.ts';

const profile: DirectorProfileRecord = {
	backend: 'native',
	createdAt: 0,
	id: 'default',
	instructions: '',
	model: null,
	reasoningEffort: 'low',
	role: 'Fleet Director',
	updatedAt: 0,
};

describe('readRecentSuggestionHistory', () => {
	test('collapses identical (project, title) rows with an occurrence count', async () => {
		const sqlite = new Database(':memory:');
		migrateWebDatabase(sqlite);
		const { db } = wrapWebDatabase(sqlite);
		try {
			const now = Date.now();
			await db
				.insert(directorCycles)
				.values({ id: 'c1', startedAt: now, status: 'completed' });
			const base = {
				cycleId: 'c1',
				description: 'd',
				reasoning: 'r',
				riskLevel: 'LOW',
				taskType: 'artifact_maintenance',
			};
			await db.insert(suggestions).values([
				// The observed spam shape: the identical suggestion re-created cycle after cycle.
				...[1, 2, 3, 4, 5].map((n) => ({
					...base,
					createdAt: now - n * 1000,
					dismissedBy: n === 1 ? 'user' : 'cycle_retire',
					id: `sug_dup_${n}`,
					projectId: 'agentwatch',
					resolvedAt: now - n * 900,
					status: 'dismissed',
					title: 'agentwatch: reconcile aidd artifacts',
				})),
				{
					...base,
					createdAt: now - 500,
					id: 'sug_other',
					projectId: 'starsync',
					status: 'pending',
					title: 'starsync: something else',
				},
			]);

			const history = await readRecentSuggestionHistory(db, { sinceMs: now - 60_000 });
			expect(history).toHaveLength(2);
			const dup = history.find((entry) => entry.projectId === 'agentwatch');
			expect(dup?.occurrences).toBe(5);
			// Most recent row wins for status/dismissedBy — here the user dismissal.
			expect(dup?.dismissedBy).toBe('user');
			expect(history.find((entry) => entry.projectId === 'starsync')?.occurrences).toBe(1);
		} finally {
			sqlite.close();
		}
	});
});

describe('buildDirectCyclePrompt suggestion memory', () => {
	const fleetSummary = { fleetAggregations: { fleetHealthScore: 80 } } as FleetSummary;

	test('instructs the model not to re-suggest user-dismissed items', () => {
		const prompt = buildDirectCyclePrompt(fleetSummary, profile, undefined);
		expect(prompt).toContain("dismissedBy='user'");
		expect(prompt).toContain('Do NOT re-suggest an equivalent item');
		expect(prompt).toContain("dismissedBy='cycle_retire'");
		expect(prompt).toContain('prefer fewer, higher-value suggestions per cycle');
	});

	test('embeds the recentSuggestions history when the context carries it', () => {
		const prompt = buildDirectCyclePrompt(fleetSummary, profile, {
			directive: null,
			profile,
			recentMessages: [],
			recentSuggestions: [
				{
					createdAt: '2026-07-09T00:00:00.000Z',
					dismissedBy: 'user',
					occurrences: 5,
					projectId: 'agentwatch',
					status: 'dismissed',
					taskType: 'artifact_maintenance',
					title: 'agentwatch: reconcile aidd artifacts',
				},
			],
			sessionId: null,
		});
		expect(prompt).toContain('agentwatch: reconcile aidd artifacts');
		expect(prompt).toContain('"occurrences": 5');
	});
});

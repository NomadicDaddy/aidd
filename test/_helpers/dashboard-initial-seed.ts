import { Database } from 'bun:sqlite';

import type { WebDatabase } from '../../backend/src/db/client.ts';
import type { DirectorConfig } from '../../backend/src/services/director/types.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import {
	directorChatSessions,
	directorCycles,
	runs,
	suggestions,
} from '../../backend/src/db/schema.ts';

/**
 * A root that does not exist, so every filesystem source the read paths consult — CLI heartbeat
 * scans, run ledgers, stop-request files, cycle artifacts — returns empty deterministically and
 * the measured bytes describe the seeded rows rather than whatever is on the machine.
 */
const ROOT = 'd:/__aidd_dashboard_initial_payload__';
const SEED_PROJECT_PATH = `${ROOT}/representative-project-00`;

/**
 * Row counts, and where each one comes from.
 *
 * The PERFORMANCE audit recorded only an aggregate for these endpoints (1,854,771 bytes across the
 * initial APIs, of which 1,399,653 was `/api/v1/projects`), never a per-endpoint split — so the
 * volumes below are taken from what actually bounds each response in production: the endpoint's own
 * server-side LIMIT, or the page size the Dashboard's hook requests. Each table is seeded past its
 * cap so the cap is what binds, which is the worst case a live fleet can produce.
 */
const SEED_VOLUMES = {
	/** `DirectorChatService.listChatSessions` reads `.limit(20)`. */
	chatSessions: 25,
	/** `DirectorCycleService.listCycles` reads `.limit(20)`. */
	cycles: 25,
	/** `useRuns()` sends no `limit`, so the route falls back to `DEFAULT_PAGE_LIMIT` (50). */
	runs: 60,
	/** `DirectorSuggestionService.listSuggestions` reads `.limit(100)`. */
	suggestions: 120,
} as const;

/**
 * One clock read for the whole seed, offset backwards per row.
 *
 * Relative rather than fixed because both read paths window on wall-clock time — the runs list
 * keeps `startedAt > now - RECENT_RUN_LOOKBACK_MS`, and a hard-coded epoch silently ages out of it
 * and measures an empty page. Millisecond timestamps are 13 digits either way, so the moving value
 * costs the measurement nothing.
 */
const NOW = Date.now();

export function seedConfig(): DirectorConfig {
	// Only `web.dataDir`, `web.allowedRoots` and `web.ignoredFolders` are read on these paths —
	// cycle-artifact probing and the CLI heartbeat scan. Resolving a real config would pull the
	// machine's own projects into the measurement.
	return {
		web: { allowedRoots: [ROOT], dataDir: `${ROOT}/data`, ignoredFolders: [] },
	} as unknown as DirectorConfig;
}

/** Prose at the length the Director actually writes it: one paragraph of reasoning per suggestion. */
function suggestionProse(index: number): string {
	return (
		`Project representative-project-${String(index % 37).padStart(2, '0')} carries an audit ` +
		'backlog whose highest-severity finding has been open across three cycles. Launching the ' +
		'remediation recipe now clears it before the next audit refresh re-files it, and the ' +
		'working tree is clean enough for an unattended run.'
	);
}

async function seedCycles(db: WebDatabase): Promise<string[]> {
	const ids: string[] = [];
	for (let index = 0; index < SEED_VOLUMES.cycles; index += 1) {
		const id = `cycle_1788074814${String(index).padStart(3, '0')}`;
		ids.push(id);
		await db.insert(directorCycles).values({
			// One launch and one skip per cycle: the shape the auto-launcher writes, and the part
			// of a cycle row that is not fixed-width.
			autoLaunch: JSON.stringify({
				launched: [
					{
						kind: 'run',
						runId: `run_1788074814${String(index).padStart(3, '0')}`,
						suggestionId: `sug_1788074814${String(index).padStart(3, '0')}`,
						title: 'representative-project-00: clear the audit backlog',
					},
				],
				skipped: [
					{
						code: 'max_per_cycle',
						reason: 'Already launched 1 of a maximum 1 run for this cycle.',
						suggestionId: `sug_1788074814${String(index + 100).padStart(3, '0')}`,
						title: 'representative-project-01: reconcile aidd artifacts',
					},
				],
			}),
			autoLaunchState: 'finalized',
			completedAt: NOW - 21_600_000 - index * 1_800_000 + 120_000,
			fleetHealthScore: 60 + (index % 30),
			id,
			initiator: index % 4 === 0 ? 'operator' : 'automatic',
			// Six to nineteen hours old: inside the runs list's 24-hour window, so the cycle
			// projections the feed merges in are present, but older than every seeded run, so the
			// page fills with run rows the way a live fleet's does.
			startedAt: NOW - 21_600_000 - index * 1_800_000,
			status: 'completed',
			totalSuggestions: 12,
		});
	}
	return ids;
}

async function seedSuggestions(db: WebDatabase, cycleIds: string[]): Promise<void> {
	for (let index = 0; index < SEED_VOLUMES.suggestions; index += 1) {
		const cycleId = cycleIds[index % cycleIds.length] ?? cycleIds[0] ?? 'cycle_0';
		await db.insert(suggestions).values({
			confidence: 0.72,
			createdAt: NOW - index * 60_000,
			cycleId,
			description: suggestionProse(index),
			evidence: JSON.stringify({
				auditBacklogCount: 14,
				bySeverity: { critical: 1, high: 4, low: 5, medium: 4 },
				profile: { bucket: 'internal-tool', criticality: 'medium' },
			}),
			id: `sug_1788074814${String(index).padStart(3, '0')}`,
			projectId: `id-representative-project-${String(index % 37).padStart(2, '0')}`,
			rank: index % 20,
			reasoning: suggestionProse(index + 1),
			riskLevel: 'MEDIUM',
			status: 'pending',
			suggestedRecipe: 'audit-remediation',
			taskType: 'audit_backlog',
			title: `representative-project-${String(index % 37).padStart(2, '0')}: clear the audit backlog`,
		});
	}
}

async function seedChatSessions(db: WebDatabase, profileId: string): Promise<void> {
	for (let index = 0; index < SEED_VOLUMES.chatSessions; index += 1) {
		await db.insert(directorChatSessions).values({
			createdAt: NOW - index * 86_400_000,
			id: `chat_1788074814${String(index).padStart(3, '0')}`,
			profileId,
			title: `What should representative-project-${String(index % 37).padStart(2, '0')} work on next?`,
			updatedAt: NOW - index * 86_400_000 + 600_000,
		});
	}
}

async function seedRuns(db: WebDatabase): Promise<void> {
	for (let index = 0; index < SEED_VOLUMES.runs; index += 1) {
		const id = `run_1788074814${String(index).padStart(3, '0')}`;
		await db.insert(runs).values({
			aiddDirty: false,
			aiddRevision: 'a55a691e',
			aiddVersion: '3.0.0',
			aiSummary:
				'Cleared the highest-severity audit finding and re-ran the gate; smoke:qc exits 0.',
			backend: 'claude-code',
			commandArgsJson: JSON.stringify([
				'--mode',
				'coding',
				'--project-dir',
				SEED_PROJECT_PATH,
			]),
			completedAt: NOW - index * 60_000 + 900_000,
			costUsd: 0.42,
			driverId: 'audit-remediation',
			driverKind: 'recipe-step',
			durationMs: 900_000,
			exitCode: 0,
			filesChanged: 7,
			id,
			initiator: 'operator',
			inputTokens: 184_320,
			linesAdded: 212,
			linesRemoved: 96,
			logPath: `${ROOT}/data/run-logs/${id}.log`,
			mode: 'coding',
			model: 'claude-opus-4-6',
			outputTokens: 18_204,
			projectName: 'representative-project-00',
			projectPath: SEED_PROJECT_PATH,
			provider: 'anthropic',
			reasoningEffort: 'high',
			source: 'web',
			// Inside RECENT_RUN_LOOKBACK_MS (24 h), which is what the unfiltered list window keeps.
			startedAt: NOW - index * 60_000,
			status: 'completed',
			summary:
				'feat(dashboard): project the landing payload instead of forwarding the listing',
		});
	}
}

/** An empty in-memory web DB with the real migration chain applied. */
export function createDirectorDb(): ReturnType<typeof wrapWebDatabase> {
	const sqlite = new Database(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	migrateWebDatabase(sqlite);
	return wrapWebDatabase(sqlite);
}

/**
 * Fills the Director tables at the volumes above.
 *
 * `profileId` must already exist: chat sessions carry a foreign key to it, and the real service
 * creates the default profile row before it lists them.
 */
export async function seedDirectorTables(db: WebDatabase, profileId: string): Promise<void> {
	const cycleIds = await seedCycles(db);
	await seedSuggestions(db, cycleIds);
	await seedChatSessions(db, profileId);
	await seedRuns(db);
}

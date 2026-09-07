import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { DirectorSuggestion } from 'aidd-shared';

import { dedupDirectorSuggestions } from 'aidd-shared';
import { eq } from 'drizzle-orm';

import type { WebDatabase } from '../../backend/src/db/client.ts';
import type { ProjectService } from '../../backend/src/services/projectService.ts';
import type { RunService } from '../../backend/src/services/runService.ts';
import type { SuggestionAutoLaunchDeps } from '../../backend/src/services/director/suggestionAutoLaunch.ts';
import type {
	DirectorAuditHealth,
	DirectorBacklogBreakdown,
	DirectorPrioritizedWork,
} from '../../backend/src/services/director/priority/types.ts';
import type { ProjectSummaryDto } from '../../backend/src/types/project.ts';
import type { WebSocketHub } from '../../backend/src/webSocketHub.ts';

import { wrapWebDatabase } from '../../backend/src/db/client.ts';
import { migrateWebDatabase } from '../../backend/src/db/migrate.ts';
import { directorCycles, suggestions } from '../../backend/src/db/schema.ts';
import { buildProjectRouteIds } from '../../backend/src/paths.ts';
import { projectPathIndex } from '../../backend/src/services/director/autoLaunchWiring.ts';
import { buildProjectWork } from '../../backend/src/services/director/priority/workBuilder.ts';
import { stampSuggestionRanks } from '../../backend/src/services/director/suggestionRank.ts';
import { autoLaunchCycleSuggestions } from '../../backend/src/services/director/suggestionAutoLaunch.ts';
import { DirectorSuggestionService } from '../../backend/src/services/director/suggestionService.ts';

/**
 * Two checkouts named `sample`, all the way through the Director.
 *
 * A folder name is not an identity. Two projects called `sample` — a clone beside its original, a
 * fork, a worktree — used to be one project everywhere the Director looked: their work items
 * carried the same `projectId`, so dedup collapsed the second onto the first; the path index was
 * keyed by name, so whichever entry survived was the tree inspected for dirt and active work; and
 * the launcher picked the first project whose name matched, which could be the other one. The net
 * effect was a run started in a checkout nothing had checked.
 *
 * These tests use the fleet's route identity end to end and pin the three properties that follow:
 * both projects keep their own suggestion, each is checked and launched against its own path, and
 * a legacy suggestion carrying only the bare name resolves to neither.
 */

const FIRST_PATH = resolve('/fleet/one/sample');
const SECOND_PATH = resolve('/fleet/two/sample');
const routeIds = buildProjectRouteIds([FIRST_PATH, SECOND_PATH]);
const FIRST_ID = routeIds.get(FIRST_PATH) ?? '';
const SECOND_ID = routeIds.get(SECOND_PATH) ?? '';

function makeProject(path: string): ProjectSummaryDto {
	return {
		artifactHealth: 'fresh',
		featureStats: { closed: 0, failing: 0, open: 0, passing: 0, total: 3, waitingApproval: 0 },
		metadata: {
			// Healthy, so the only work item either project raises is its remediation backlog.
			artifactCheck: {
				artifacts: [],
				checkedAt: '2026-01-01T00:00:00.000Z',
				staleThresholdDays: 30,
				summary: {
					fresh: 0,
					missing: 0,
					present: 0,
					requiredMissing: 0,
					stale: 0,
					total: 0,
				},
			},
			maturity: {
				currentStageId: 'engaged',
				currentStageLabel: 'engaged',
				nextArtifactLabel: null,
				nextArtifactSlug: null,
				percent: 0,
				stageStatuses: [],
			},
			profile: {
				authMode: 'local_owner',
				bucket: 'single_user_local',
				criticality: 'utility',
				dataSensitivity: 'low',
				deployment: 'local',
				derivesFromTemplate: 'none',
				externalIntegrations: 'none',
				hasCliBinary: 'none',
				publishesReleaseArchives: 'none',
				shipsContainerImage: 'none',
				source: 'explicit',
				updatedAt: '2026-01-01T00:00:00.000Z',
			},
		},
		name: 'sample',
		path,
		phase: 'coding',
		routeId: routeIds.get(path) ?? '',
	} as unknown as ProjectSummaryDto;
}

const emptyAuditHealth: DirectorAuditHealth = {
	checkedAt: '2026-01-01T00:00:00.000Z',
	fresh: [],
	missing: [],
	stale: [],
	staleThresholdDays: 30,
};

function backlogWithRemediation(count: number): DirectorBacklogBreakdown {
	return {
		audit: { bySeverity: {}, count: 0, top: [] },
		feature: { blockedCount: 0, count: 0, readyCount: 0, top: [] },
		remediation: { count, top: [] },
	};
}

/** The model copies the work item's identity onto the suggestion it authors; so does this. */
function suggestionFor(item: DirectorPrioritizedWork): DirectorSuggestion {
	return {
		description: item.reason,
		evidence: {},
		projectId: item.projectId,
		reasoning: item.reason,
		riskLevel: item.riskLevel,
		suggestedArgs: item.suggestedArgs,
		suggestedRecipe: item.suggestedRecipe,
		taskType: item.taskType,
		title: item.title,
	};
}

describe('two projects named sample', () => {
	test('the route identity is what distinguishes them, and the name is kept for reading', () => {
		expect(FIRST_ID).not.toBe(SECOND_ID);
		expect(FIRST_ID.startsWith('sample~')).toBe(true);
		expect(SECOND_ID.startsWith('sample~')).toBe(true);

		const [first] = buildProjectWork(
			makeProject(FIRST_PATH),
			backlogWithRemediation(1),
			emptyAuditHealth,
			true,
		);
		expect(first?.projectId).toBe(FIRST_ID);
		expect(first?.projectName).toBe('sample');
		// The title an operator reads still says `sample`; only the identity disambiguates.
		expect(first?.title).toBe('sample: resolve remediation backlog');
	});

	test('both suggestion targets survive deduplication and keep their own rank', () => {
		const work = [
			...buildProjectWork(
				makeProject(FIRST_PATH),
				backlogWithRemediation(1),
				emptyAuditHealth,
				true,
			),
			...buildProjectWork(
				makeProject(SECOND_PATH),
				backlogWithRemediation(4),
				emptyAuditHealth,
				true,
			),
		].map((item, index) => ({ ...item, rank: index + 1 }));

		const deduped = dedupDirectorSuggestions(work.map(suggestionFor));
		expect(deduped.map((item) => item.projectId)).toEqual([FIRST_ID, SECOND_ID]);

		// Same key drives both halves: surviving dedup as two items has to mean matching two
		// distinct ancestors here, or the second project's rank would silently come back null.
		const ranked = stampSuggestionRanks(deduped, work);
		expect(ranked.map((item) => item.rank)).toEqual([1, 2]);
	});
});

interface LaunchLog {
	dirtyReads: string[];
	busyReads: string[];
	launched: string[];
}

function candidate(id: string, projectId: string) {
	return { id, projectId, rank: 1, riskLevel: 'LOW', suggestedRecipe: null, title: id };
}

function autoLaunchDeps(
	log: LaunchLog,
	candidates: ReturnType<typeof candidate>[],
): SuggestionAutoLaunchDeps {
	return {
		config: {
			allowedRecipes: [],
			enabled: true,
			maxPerCycle: 5,
			maxRank: 5,
			riskCeiling: 'LOW',
		},
		dirtyTreeThreshold: 50,
		hasActiveWorkForProject: async (projectPath) => {
			log.busyReads.push(projectPath);
			return false;
		},
		launch: async (suggestionId) => {
			log.launched.push(suggestionId);
			return { kind: 'run', runId: `run_${suggestionId}` };
		},
		listPending: async () => candidates,
		readDirtyFileCount: async (projectPath) => {
			log.dirtyReads.push(projectPath);
			return 0;
		},
		resolveProjectPaths: async () =>
			await projectPathIndex(async () => ({
				projects: [
					{ path: FIRST_PATH, routeId: FIRST_ID },
					{ path: SECOND_PATH, routeId: SECOND_ID },
				],
			})),
	};
}

describe('auto-launch against two projects named sample', () => {
	test('each suggestion is checked and launched against its own checkout', async () => {
		const log: LaunchLog = { busyReads: [], dirtyReads: [], launched: [] };
		const outcome = await autoLaunchCycleSuggestions(
			autoLaunchDeps(log, [candidate('s1', FIRST_ID), candidate('s2', SECOND_ID)]),
			'cycle-1',
		);

		expect(outcome?.launched.map((entry) => entry.suggestionId)).toEqual(['s1', 's2']);
		expect(outcome?.skipped).toEqual([]);
		// Two projects, two working trees inspected. Keyed by name, the second suggestion read the
		// first one's tree — the check and the launch could disagree about which `sample` it was.
		expect(log.busyReads).toEqual([FIRST_PATH, SECOND_PATH]);
		expect(log.dirtyReads).toEqual([FIRST_PATH, SECOND_PATH]);
		expect(log.launched).toEqual(['s1', 's2']);
	});

	test('a legacy suggestion carrying only the bare name launches neither checkout', async () => {
		const log: LaunchLog = { busyReads: [], dirtyReads: [], launched: [] };
		const outcome = await autoLaunchCycleSuggestions(
			autoLaunchDeps(log, [candidate('legacy', 'sample')]),
			'cycle-2',
		);

		expect(outcome?.launched).toEqual([]);
		expect(outcome?.skipped.map((entry) => entry.code)).toEqual(['project_unavailable']);
		expect(log.launched).toEqual([]);
		// Neither tree was even inspected: with no path there is nothing to inspect, and guessing
		// at one of the two would be the bug this refusal exists to prevent.
		expect(log.busyReads).toEqual([]);
		expect(log.dirtyReads).toEqual([]);
	});
});

function memoryDb(): { db: WebDatabase; sqlite: Database } {
	const sqlite = new Database(':memory:');
	migrateWebDatabase(sqlite);
	return { db: wrapWebDatabase(sqlite).db, sqlite };
}

async function seedSuggestion(db: WebDatabase, id: string, projectId: string): Promise<void> {
	const now = Date.now();
	await db
		.insert(directorCycles)
		.values({ id: `cycle_${id}`, startedAt: now, status: 'completed' });
	await db.insert(suggestions).values({
		createdAt: now,
		cycleId: `cycle_${id}`,
		description: 'd',
		evidence: '{}',
		id,
		projectId,
		rank: 1,
		reasoning: 'r',
		riskLevel: 'LOW',
		status: 'pending',
		taskType: 'remediation_backlog',
		title: id,
	});
}

async function readStatus(db: WebDatabase, id: string): Promise<string | undefined> {
	const rows = await db
		.select({ status: suggestions.status })
		.from(suggestions)
		.where(eq(suggestions.id, id));
	return rows[0]?.status;
}

/** The fleet resolver's own semantics: a route identity resolves, a shared bare name refuses. */
function stubProjectService(): ProjectService {
	return {
		resolveDiscoveredProject: async (projectId: string) => {
			if (projectId === FIRST_ID) return FIRST_PATH;
			if (projectId === SECOND_ID) return SECOND_PATH;
			throw new Error(
				`Ambiguous project name "sample" matches 2 projects. Use one of: ${FIRST_ID}, ${SECOND_ID}`,
			);
		},
	} as unknown as ProjectService;
}

const silentHub = { broadcast: () => undefined } as unknown as WebSocketHub;

describe('launching a suggestion that names one of two sample checkouts', () => {
	test('the run starts in the checkout the suggestion identifies', async () => {
		const { db, sqlite } = memoryDb();
		try {
			await seedSuggestion(db, 's2', SECOND_ID);
			const dirs: string[] = [];
			const runService = {
				launchRun: async (request: { projectDir: string }) => {
					dirs.push(request.projectDir);
					return { id: 'run-1' };
				},
			} as unknown as RunService;
			const service = new DirectorSuggestionService(
				db,
				silentHub,
				stubProjectService(),
				runService,
			);

			const launched = await service.launchSuggestion('s2');

			expect(launched).toEqual({ kind: 'run', runId: 'run-1' });
			// The second `sample`, not the first one a name match would have found.
			expect(dirs).toEqual([SECOND_PATH]);
			expect(await readStatus(db, 's2')).toBe('launched');
		} finally {
			sqlite.close();
		}
	});

	test('an ambiguous legacy suggestion starts nothing and stays actionable', async () => {
		const { db, sqlite } = memoryDb();
		try {
			await seedSuggestion(db, 'legacy', 'sample');
			const runService = {
				launchRun: async () => {
					throw new Error('a run must not be launched for an ambiguous project');
				},
			} as unknown as RunService;
			const service = new DirectorSuggestionService(
				db,
				silentHub,
				stubProjectService(),
				runService,
			);

			await expect(service.launchSuggestion('legacy')).rejects.toThrow(
				/Ambiguous project name/,
			);
			// Refused before the pending -> launching claim, so an operator can still act on it
			// once they say which checkout they meant.
			expect(await readStatus(db, 'legacy')).toBe('pending');
		} finally {
			sqlite.close();
		}
	});
});

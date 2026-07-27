import { describe, expect, test } from 'bun:test';
import type { PipelineSessionRecord, RunRecord } from '../../frontend/src/api/types.ts';
import {
	buildProjectRouteIdByPath,
	buildUnifiedEntries,
	entryKey,
	entryMatchesFilters,
	entryMatchesStatus,
	historyDisplayFloor,
	initialSelection,
	isEntryActive,
	isMultiStepSession,
	isSkillSession,
	needsRunRecordFallback,
	oldestStartedAt,
	splitEntriesByLiveness,
	type UnifiedEntryFilters,
} from '../../frontend/src/pages/runs/unifiedEntries.ts';

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
	return {
		activityState: null,
		aiddDirty: null,
		aiddRevision: null,
		aiddVersion: null,
		aiSummary: null,
		backend: 'native',
		canKill: false,
		canReadOutput: true,
		canStop: false,
		chainedFromRunId: null,
		completedAt: 1_000,
		continuationReason: null,
		durationMs: 1_000,
		errorMessage: null,
		exitCode: 0,
		heartbeatAt: null,
		id: 'run_1',
		launchCommand: null,
		logPath: null,
		mode: 'coding',
		model: null,
		pid: null,
		pipelineSessionId: null,
		projectId: 'aidd',
		projectName: 'aidd',
		projectPath: 'd:/applications/aidd',
		provider: null,
		reasoningEffort: null,
		source: 'web',
		startedAt: 1_000,
		status: 'completed',
		stopReason: null,
		stopRequested: false,
		summary: null,
		...overrides,
	};
}

function makeSession(overrides: Partial<PipelineSessionRecord> = {}): PipelineSessionRecord {
	return {
		completedAt: null,
		currentStepIndex: 1,
		durationMs: null,
		errorMessage: null,
		executionIdentities: [],
		id: 'sess_1',
		parametersJson: '{}',
		projectName: 'aidd',
		projectPath: 'd:/applications/aidd',
		recipeId: 'full-build',
		recipeName: 'Full Build',
		startedAt: 2_000,
		status: 'running',
		totalSteps: 5,
		...overrides,
	};
}

function baseFilters(overrides: Partial<UnifiedEntryFilters> = {}): UnifiedEntryFilters {
	return { mode: 'all', project: 'all', query: '', status: 'all', ...overrides };
}

describe('unified execution entries', () => {
	test('interleaves runs and sessions newest-first', () => {
		const entries = buildUnifiedEntries(
			[
				makeRun({ id: 'r_old', startedAt: 1_000 }),
				makeRun({ id: 'r_new', startedAt: 5_000 }),
			],
			[makeSession({ id: 's_mid', startedAt: 3_000 })],
		);
		expect(entries.map(entryKey)).toEqual(['run:r_new', 'pipeline:s_mid', 'run:r_old']);
	});

	test('partitions active vs history without reordering within each group', () => {
		const entries = buildUnifiedEntries(
			[
				makeRun({ id: 'r_running', startedAt: 1_000, status: 'running' }),
				makeRun({ id: 'r_done', startedAt: 4_000 }),
			],
			[
				makeSession({ id: 's_queued', startedAt: 2_000, status: 'queued' }),
				makeSession({ id: 's_done', startedAt: 3_000, status: 'completed' }),
			],
		);
		const { active, history } = splitEntriesByLiveness(entries);
		expect(active.map(entryKey)).toEqual(['pipeline:s_queued', 'run:r_running']);
		expect(history.map(entryKey)).toEqual(['run:r_done', 'pipeline:s_done']);
	});

	test('only multi-step sessions nest', () => {
		expect(isMultiStepSession(makeSession({ totalSteps: 1 }))).toBe(false);
		expect(isMultiStepSession(makeSession({ totalSteps: 2 }))).toBe(true);
	});

	test('skill sessions are marked by the reserved recipe-id prefix', () => {
		expect(isSkillSession(makeSession({ recipeId: 'skill:feature-coverage-audit' }))).toBe(
			true,
		);
		expect(isSkillSession(makeSession({ recipeId: 'full-build' }))).toBe(false);
	});

	test('text search matches "skill" for a skill session, "pipeline" for a recipe', () => {
		const skill = {
			kind: 'pipeline',
			session: makeSession({ recipeId: 'skill:feature-coverage-audit' }),
		} as const;
		const recipe = {
			kind: 'pipeline',
			session: makeSession({ recipeId: 'full-build' }),
		} as const;
		expect(entryMatchesFilters(skill, baseFilters({ query: 'skill' }))).toBe(true);
		expect(entryMatchesFilters(skill, baseFilters({ query: 'pipeline' }))).toBe(false);
		expect(entryMatchesFilters(recipe, baseFilters({ query: 'pipeline' }))).toBe(true);
	});

	test('queued and running sessions are active; terminal statuses are not', () => {
		expect(
			isEntryActive({ kind: 'pipeline', session: makeSession({ status: 'queued' }) }),
		).toBe(true);
		expect(
			isEntryActive({
				kind: 'pipeline',
				session: makeSession({ status: 'completed_with_failures' }),
			}),
		).toBe(false);
		expect(isEntryActive({ kind: 'run', run: makeRun({ status: 'running' }) })).toBe(true);
		expect(isEntryActive({ kind: 'run', run: makeRun({ status: 'killed' }) })).toBe(false);
	});

	test('status filter spans both enums; kind-specific values hide the other kind', () => {
		const run = { kind: 'run', run: makeRun({ status: 'completed' }) } as const;
		const session = {
			kind: 'pipeline',
			session: makeSession({ status: 'completed' }),
		} as const;
		// Shared value matches both kinds.
		expect(entryMatchesStatus(run, 'completed')).toBe(true);
		expect(entryMatchesStatus(session, 'completed')).toBe(true);
		// Run-only value hides sessions.
		expect(
			entryMatchesStatus({ kind: 'run', run: makeRun({ status: 'killed' }) }, 'killed'),
		).toBe(true);
		expect(entryMatchesStatus(session, 'killed')).toBe(false);
		// Session-only values hide runs.
		expect(
			entryMatchesStatus(
				{ kind: 'pipeline', session: makeSession({ status: 'queued' }) },
				'queued',
			),
		).toBe(true);
		expect(entryMatchesStatus(run, 'queued')).toBe(false);
		expect(
			entryMatchesStatus(
				{ kind: 'pipeline', session: makeSession({ status: 'completed_with_failures' }) },
				'completed_with_failures',
			),
		).toBe(true);
		expect(entryMatchesStatus(run, 'completed_with_failures')).toBe(false);
	});

	test('a specific mode filter hides pipeline entries', () => {
		const session = { kind: 'pipeline', session: makeSession() } as const;
		const codingRun = { kind: 'run', run: makeRun({ mode: 'coding' }) } as const;
		expect(entryMatchesFilters(session, baseFilters())).toBe(true);
		expect(entryMatchesFilters(session, baseFilters({ mode: 'coding' }))).toBe(false);
		expect(entryMatchesFilters(codingRun, baseFilters({ mode: 'coding' }))).toBe(true);
		expect(entryMatchesFilters(codingRun, baseFilters({ mode: 'audit' }))).toBe(false);
	});

	test('project filter tolerates separator differences; text search covers recipe names', () => {
		const session = {
			kind: 'pipeline',
			session: makeSession({ projectPath: 'd:\\applications\\aidd' }),
		} as const;
		expect(entryMatchesFilters(session, baseFilters({ project: 'd:/applications/aidd' }))).toBe(
			true,
		);
		expect(entryMatchesFilters(session, baseFilters({ query: 'full build' }))).toBe(true);
		expect(entryMatchesFilters(session, baseFilters({ query: 'pipeline' }))).toBe(true);
		expect(entryMatchesFilters(session, baseFilters({ query: 'no-such-thing' }))).toBe(false);
	});

	test('project route ids are keyed by normalized paths', () => {
		const routeIds = buildProjectRouteIdByPath([
			{ path: 'D:\\applications\\aidd', routeId: 'aidd' },
		]);
		expect(routeIds.get('d:\\applications\\aidd')).toBe('aidd');
	});

	test('history floor hides the sparser source below the denser source watermark', () => {
		// Runs loaded down to t=100 with more pages; sessions loaded down to t=10 with more
		// pages. Between 10 and 100 there may be unloaded runs, so the floor is 100 — the
		// session at t=50 must stay hidden until runs catch up.
		expect(
			historyDisplayFloor([
				{ hasMore: true, oldestLoaded: 100 },
				{ hasMore: true, oldestLoaded: 10 },
			]),
		).toBe(100);
	});

	test('an exhausted source imposes no history floor', () => {
		// Runs fully loaded (24h lookback exhausted): sessions older than any loaded run may
		// be shown faithfully — nothing unloaded can fall between them.
		expect(
			historyDisplayFloor([
				{ hasMore: false, oldestLoaded: 100 },
				{ hasMore: true, oldestLoaded: 10 },
			]),
		).toBe(10);
		expect(
			historyDisplayFloor([
				{ hasMore: false, oldestLoaded: 100 },
				{ hasMore: false, oldestLoaded: 10 },
			]),
		).toBe(Number.NEGATIVE_INFINITY);
	});

	test('oldestStartedAt finds the minimum regardless of order', () => {
		expect(oldestStartedAt([])).toBeUndefined();
		expect(oldestStartedAt([{ startedAt: 5 }, { startedAt: 2 }, { startedAt: 9 }])).toBe(2);
	});

	test('run-record fallback engages only for a run selection missing from the list', () => {
		const listed = makeRun({ id: 'listed' });
		expect(needsRunRecordFallback({ id: 'listed', kind: 'run' }, [listed])).toBe(false);
		expect(needsRunRecordFallback({ id: 'piped_child', kind: 'run' }, [listed])).toBe(true);
		expect(needsRunRecordFallback({ id: 'sess', kind: 'pipeline' }, [listed])).toBe(false);
		expect(needsRunRecordFallback(undefined, [listed])).toBe(false);
	});

	test('selection parsing: ?run= wins over ?pipeline=', () => {
		expect(initialSelection(new URLSearchParams('run=r1'))).toEqual({ id: 'r1', kind: 'run' });
		expect(initialSelection(new URLSearchParams('pipeline=s1'))).toEqual({
			id: 's1',
			kind: 'pipeline',
		});
		expect(initialSelection(new URLSearchParams('run=r1&pipeline=s1'))).toEqual({
			id: 'r1',
			kind: 'run',
		});
		expect(initialSelection(new URLSearchParams(''))).toBeUndefined();
	});
});

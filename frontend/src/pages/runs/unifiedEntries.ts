import type {
	PipelineSessionRecord,
	PipelineSessionStatus,
	RunMode,
	RunRecord,
	RunStatus,
} from '../../api/types.ts';

import { normalizePathForFilter } from './runsUtils.ts';

// One row in the unified execution feed: an ad-hoc run or a recipe pipeline session.
// Pipeline-owned runs never appear as top-level entries (the list is fetched with
// topLevel=true); they surface inside their session's expanded step rows.
export type UnifiedEntry =
	{ kind: 'pipeline'; session: PipelineSessionRecord } | { kind: 'run'; run: RunRecord };

// Filter vocabulary spanning both status enums. Values unique to one kind simply
// filter the other kind out (e.g. 'killed' → runs only, 'queued' → sessions only).
export type UnifiedStatusFilter =
	'all' | 'completed_with_failures' | 'queued' | PipelineSessionStatus | RunStatus;

export type UnifiedSelection = { id: string; kind: 'pipeline' | 'run' };

export function entryKey(entry: UnifiedEntry): string {
	return entry.kind === 'run' ? `run:${entry.run.id}` : `pipeline:${entry.session.id}`;
}

export function entryStartedAt(entry: UnifiedEntry): number {
	return entry.kind === 'run' ? entry.run.startedAt : entry.session.startedAt;
}

export function isEntryActive(entry: UnifiedEntry): boolean {
	if (entry.kind === 'run') return entry.run.status === 'running';
	return entry.session.status === 'queued' || entry.session.status === 'running';
}

// Only multi-step pipelines nest: a single-step session's step row would just restate the
// session row, so it gets no chevron and no sub-rows — its Console button reaches the run.
export function isMultiStepSession(session: PipelineSessionRecord): boolean {
	return session.totalSteps > 1;
}

// A skill run is launched through the pipeline executor as a synthetic one-step recipe
// whose id carries the reserved `skill:` prefix. It's a real session, but it should read
// as a "Skill", not a "Pipeline". The id prefix is the backend's authoritative marker.
export function isSkillSession(session: PipelineSessionRecord): boolean {
	return session.recipeId.startsWith('skill:');
}

// Interleave both collections newest-first. Active/History is a partition concern
// (splitEntriesByLiveness), not a sort concern, so a finished entry settles into
// its chronological slot without a jarring re-sort.
export function buildUnifiedEntries(
	runs: RunRecord[],
	sessions: PipelineSessionRecord[],
): UnifiedEntry[] {
	const entries: UnifiedEntry[] = [
		...runs.map((run): UnifiedEntry => ({ kind: 'run', run })),
		...sessions.map((session): UnifiedEntry => ({ kind: 'pipeline', session })),
	];
	return entries.sort((a, b) => entryStartedAt(b) - entryStartedAt(a));
}

export function buildProjectRouteIdByPath(
	projects: readonly { path: string; routeId: string }[],
): ReadonlyMap<string, string> {
	return new Map(
		projects.map((project) => [normalizePathForFilter(project.path), project.routeId]),
	);
}

export function splitEntriesByLiveness(entries: UnifiedEntry[]): {
	active: UnifiedEntry[];
	history: UnifiedEntry[];
} {
	const active: UnifiedEntry[] = [];
	const history: UnifiedEntry[] = [];
	for (const entry of entries) (isEntryActive(entry) ? active : history).push(entry);
	return { active, history };
}

export function entryMatchesStatus(entry: UnifiedEntry, filter: UnifiedStatusFilter): boolean {
	if (filter === 'all') return true;
	return entry.kind === 'run' ? entry.run.status === filter : entry.session.status === filter;
}

export interface UnifiedEntryFilters {
	mode: 'all' | RunMode;
	project: string;
	query: string;
	status: UnifiedStatusFilter;
}

export function entryMatchesFilters(entry: UnifiedEntry, filters: UnifiedEntryFilters): boolean {
	const projectPath = entry.kind === 'run' ? entry.run.projectPath : entry.session.projectPath;
	if (
		filters.project !== 'all' &&
		normalizePathForFilter(projectPath) !== normalizePathForFilter(filters.project)
	) {
		return false;
	}
	if (!entryMatchesStatus(entry, filters.status)) return false;
	// Mode is a run-only concept; a specific mode filter hides pipeline entries.
	if (filters.mode !== 'all' && (entry.kind !== 'run' || entry.run.mode !== filters.mode)) {
		return false;
	}
	const haystack =
		entry.kind === 'run'
			? `${entry.run.id} ${entry.run.projectName} ${entry.run.projectPath} ${entry.run.mode} ${entry.run.status} ${entry.run.source}`
			: `${entry.session.id} ${entry.session.projectName} ${entry.session.projectPath} ${entry.session.recipeName} ${entry.session.status} ${isSkillSession(entry.session) ? 'skill' : 'pipeline'}`;
	return haystack.toLowerCase().includes(filters.query.toLowerCase());
}

// ?run= wins when both params are present: a step-row click selects its run while the
// session keeps ?pipeline= for expansion context.
export function initialSelection(searchParams: URLSearchParams): undefined | UnifiedSelection {
	const runId = searchParams.get('run');
	if (runId) return { id: runId, kind: 'run' };
	const pipelineId = searchParams.get('pipeline');
	if (pipelineId) return { id: pipelineId, kind: 'pipeline' };
	return undefined;
}

// A deep-linked ?run= id (e.g. a pipeline-owned run) may be absent from the topLevel
// list; the console then needs a single-record fetch (useRunRecord) to open it.
export function needsRunRecordFallback(
	selection: undefined | UnifiedSelection,
	runs: RunRecord[],
): boolean {
	return selection?.kind === 'run' && !runs.some((run) => run.id === selection.id);
}

export function oldestStartedAt(items: { startedAt: number }[]): number | undefined {
	let oldest: number | undefined;
	for (const item of items) {
		if (oldest === undefined || item.startedAt < oldest) oldest = item.startedAt;
	}
	return oldest;
}

// The two sources paginate independently, so History can only faithfully interleave down
// to the newest "oldest loaded" timestamp among sources that still have unloaded pages —
// below that, one source has entries the other hasn't loaded yet and the timeline would
// show gaps as if nothing happened. Entries under the floor stay hidden until "Show more"
// advances the lagging source (nothing is lost, only deferred). An exhausted source
// (hasMore=false) imposes no floor.
export function historyDisplayFloor(
	sources: { hasMore: boolean; oldestLoaded: number | undefined }[],
): number {
	let floor = Number.NEGATIVE_INFINITY;
	for (const source of sources) {
		if (source.hasMore && source.oldestLoaded !== undefined && source.oldestLoaded > floor) {
			floor = source.oldestLoaded;
		}
	}
	return floor;
}

import type {
	BlueprintSetupActivity,
	BlueprintSetupLifecycle,
} from 'aidd-shared/metadata/blueprint-setup';

import { desc } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { RunRecord, WebRunMode } from '../../types.ts';

import { projectPathMatches } from '../../db/commands/projectPaths.ts';
import { pipelineSessions } from '../../db/schema.ts';

/**
 * Run modes that can move a project through initializer or onboarding toward a blueprint.
 *
 * `coding` runs execute the initializer and onboarding phases themselves; `interview` gathers the
 * spec those phases turn into features; `directive` is how the intake pipeline's setup steps write
 * metadata. Every other mode — audits, validation, director cycles, todos, triumvirate reviews —
 * inspects a project rather than setting one up, so an active one of those says nothing about a
 * blueprint and must not license in-progress wording for it.
 */
export const blueprintSetupRunModes: readonly WebRunMode[] = ['coding', 'directive', 'interview'];

const setupRunModes = new Set<WebRunMode>(blueprintSetupRunModes);

/** A normalized candidate, ordered against the others by `startedAt` within its lifecycle. */
export interface SetupActivityCandidate extends BlueprintSetupActivity {
	startedAt: number;
}

export interface SetupPipelineSession {
	id: string;
	recipeName: string;
	startedAt: number;
	status: string;
}

export type SetupActivityProvider = (projectPath: string) => Promise<BlueprintSetupActivity | null>;

// Most-to-least informative about what the project is doing right now. Running work is the only
// lifecycle that earns in-progress wording; queued work has not started; the terminal and waiting
// lifecycles explain why nothing is moving. Completed work is absent entirely — it is history, and
// history is exactly what the reported defect presented as activity.
const lifecycleRank: Record<BlueprintSetupLifecycle, number> = {
	failed: 4,
	queued: 2,
	running: 1,
	stopped: 4,
	waiting_approval: 3,
};

function runLifecycle(status: string): BlueprintSetupLifecycle | null {
	switch (status) {
		case 'failed':
			return 'failed';
		case 'killed':
		case 'stopped':
			return 'stopped';
		case 'running':
			return 'running';
		case 'waiting_approval':
			return 'waiting_approval';
		default:
			// 'completed', and anything a future status adds, is not activity.
			return null;
	}
}

function pipelineLifecycle(status: string): BlueprintSetupLifecycle | null {
	switch (status) {
		case 'failed':
			return 'failed';
		case 'queued':
			return 'queued';
		case 'running':
			return 'running';
		case 'stopped':
			return 'stopped';
		default:
			return null;
	}
}

export function toRunCandidate(run: RunRecord): null | SetupActivityCandidate {
	if (!setupRunModes.has(run.mode)) return null;
	const lifecycle = runLifecycle(run.status);
	if (lifecycle === null) return null;
	return {
		kind: 'run',
		label: `The ${run.mode} run`,
		lifecycle,
		reference: run.id,
		startedAt: run.startedAt,
	};
}

export function toPipelineCandidate(session: SetupPipelineSession): null | SetupActivityCandidate {
	const lifecycle = pipelineLifecycle(session.status);
	if (lifecycle === null) return null;
	return {
		kind: 'pipeline',
		label: `The ${session.recipeName} pipeline`,
		lifecycle,
		reference: session.id,
		startedAt: session.startedAt,
	};
}

/**
 * The one piece of work that best describes this project's setup right now, or null when none of
 * the candidates is relevant. Callers must have already narrowed the candidates to a single
 * project: this function ranks, it does not filter by ownership.
 *
 * @param candidates Normalized candidates for one project; nulls (irrelevant work) are ignored.
 * @returns The best candidate, or null when none is relevant.
 */
export function selectSetupActivity(
	candidates: readonly (null | SetupActivityCandidate)[],
): BlueprintSetupActivity | null {
	const ranked = candidates
		.filter((candidate): candidate is SetupActivityCandidate => candidate !== null)
		.sort((left, right) => {
			const byLifecycle = lifecycleRank[left.lifecycle] - lifecycleRank[right.lifecycle];
			return byLifecycle === 0 ? right.startedAt - left.startedAt : byLifecycle;
		});
	const best = ranked[0];
	if (best === undefined) return null;
	return {
		kind: best.kind,
		label: best.label,
		lifecycle: best.lifecycle,
		reference: best.reference,
	};
}

export async function listSetupPipelineSessions(
	db: WebDatabase,
	projectPath: string,
	limit = 10,
): Promise<SetupPipelineSession[]> {
	return await db
		.select({
			id: pipelineSessions.id,
			recipeName: pipelineSessions.recipeName,
			startedAt: pipelineSessions.startedAt,
			status: pipelineSessions.status,
		})
		.from(pipelineSessions)
		.where(projectPathMatches(pipelineSessions.projectPath, projectPath))
		.orderBy(desc(pipelineSessions.startedAt))
		.limit(limit);
}

export interface SetupActivitySources {
	listPipelineSessions(projectPath: string): Promise<SetupPipelineSession[]>;
	listRuns(projectPath: string): Promise<RunRecord[]>;
}

/**
 * Reads live execution state for one project and reduces it to at most one activity.
 *
 * Both sources are already scoped to the project path, and both already drop long-finished work —
 * `listRunsForProject` keeps non-terminal runs plus terminal ones inside the recent lookback. A
 * source that fails is treated as "nothing found" rather than failing the whole project detail:
 * a project overview that cannot load is worse than one that reports an idle project as idle.
 *
 * @param sources The run and pipeline readers to consult.
 * @returns A provider that resolves one project path to at most one activity.
 */
export function createSetupActivityProvider(sources: SetupActivitySources): SetupActivityProvider {
	return async (projectPath) => {
		const [runs, pipelines] = await Promise.all([
			sources.listRuns(projectPath).catch(() => [] as RunRecord[]),
			sources.listPipelineSessions(projectPath).catch(() => [] as SetupPipelineSession[]),
		]);
		return selectSetupActivity([
			...runs.map((run) => toRunCandidate(run)),
			...pipelines.map((session) => toPipelineCandidate(session)),
		]);
	};
}

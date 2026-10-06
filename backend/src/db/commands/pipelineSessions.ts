import { and, inArray } from 'drizzle-orm';

import type {
	LocalTransaction,
	StartPipelineSessionIfProjectIdleArgs,
	StartPipelineSessionIfProjectIdleResult,
} from './types.ts';

import { pipelineSessions, runs } from '../schema.ts';
import { projectPathMatches } from './projectPaths.ts';

const ACTIVE_STATUSES = ['queued', 'running'];

/**
 * Inserts a pipeline session only when its project has no active session and no active run.
 *
 * A session's shell steps work in the live tree, and its write guard attributes every change made
 * there to its own step. A second session, or a run, in the same project interleaves with it and
 * fails a step for work that step never did. Only the Director's auto-launcher used to check; the
 * check and the insert now share one transaction on every launch path, so two launches cannot both
 * see the project idle.
 */
export function startPipelineSessionIfProjectIdle(
	tx: LocalTransaction,
	args: StartPipelineSessionIfProjectIdleArgs,
): StartPipelineSessionIfProjectIdleResult {
	const projectPath = args.values.projectPath;
	const session = tx
		.select({ id: pipelineSessions.id })
		.from(pipelineSessions)
		.where(
			and(
				projectPathMatches(pipelineSessions.projectPath, projectPath),
				inArray(pipelineSessions.status, ACTIVE_STATUSES),
			),
		)
		.limit(1)
		.all()[0];
	if (session) return { activeId: session.id, activeKind: 'session', kind: 'busy' };
	const run = tx
		.select({ id: runs.id })
		.from(runs)
		.where(
			and(
				projectPathMatches(runs.projectPath, projectPath),
				inArray(runs.status, ACTIVE_STATUSES),
			),
		)
		.limit(1)
		.all()[0];
	if (run) return { activeId: run.id, activeKind: 'run', kind: 'busy' };
	tx.insert(pipelineSessions).values(args.values).run();
	return { kind: 'started' };
}

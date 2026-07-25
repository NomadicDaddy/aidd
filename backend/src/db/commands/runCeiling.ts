import { and, count, eq, inArray } from 'drizzle-orm';

import type {
	InsertRunIfUnderCeilingArgs,
	InsertRunIfUnderCeilingResult,
	LocalTransaction,
} from './types.ts';

import { NON_TERMINAL_RUN_STATUSES } from '../../services/run/types.ts';
import { runs } from '../schema.ts';

/**
 * Atomically counts non-terminal runs and inserts a new run row if the count is
 * below the configured ceiling. The count-then-insert happens inside a single
 * SQLite transaction so parallel launch callers cannot overshoot the ceiling
 * (eliminating the TOCTOU race that existed when launch.ts counted and inserted
 * as two separate statements).
 */
export function insertRunIfUnderCeiling(
	tx: LocalTransaction,
	args: InsertRunIfUnderCeilingArgs,
): InsertRunIfUnderCeilingResult {
	const globalRows = tx
		.select({ value: count() })
		.from(runs)
		.where(inArray(runs.status, [...NON_TERMINAL_RUN_STATUSES]))
		.all();
	const globalCount = globalRows[0]?.value ?? 0;
	if (globalCount >= args.maxConcurrentRuns) {
		return {
			activeCount: globalCount,
			kind: 'rejected',
			limit: args.maxConcurrentRuns,
			scope: 'global',
		};
	}
	// Per-project ceiling: with worktree isolation, multiple runs can safely execute on one
	// project at once, but this caps how many so a single project can't starve the global pool.
	const projectRows = tx
		.select({ value: count() })
		.from(runs)
		.where(
			and(
				inArray(runs.status, [...NON_TERMINAL_RUN_STATUSES]),
				eq(runs.projectPath, args.values.projectPath),
			),
		)
		.all();
	const projectCount = projectRows[0]?.value ?? 0;
	if (projectCount >= args.maxConcurrentRunsPerProject) {
		return {
			activeCount: projectCount,
			kind: 'rejected',
			limit: args.maxConcurrentRunsPerProject,
			scope: 'project',
		};
	}
	tx.insert(runs).values(args.values).run();
	return { kind: 'inserted' };
}

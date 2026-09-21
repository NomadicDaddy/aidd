import { and, asc, count, eq, inArray, ne } from 'drizzle-orm';
import { join } from 'node:path';

import type { WebRunMode } from '../../types.ts';
import type {
	InsertQueuedRunArgs,
	InsertQueuedRunResult,
	LocalTransaction,
	PromoteOldestQueuedRunArgs,
	PromoteOldestQueuedRunResult,
} from './types.ts';

import { effectiveProjectRunCeiling, mayMutateProject } from '../../services/run/launchMutation.ts';
import { NON_TERMINAL_RUN_STATUSES } from '../../services/run/types.ts';
import { runs } from '../schema.ts';
import { projectPathMatches } from './projectPaths.ts';

function managedRunningWhere() {
	return and(inArray(runs.status, [...NON_TERMINAL_RUN_STATUSES]), ne(runs.source, 'cli'));
}

function countManagedRunning(tx: LocalTransaction, projectPath?: string): number {
	const rows = tx
		.select({ value: count() })
		.from(runs)
		.where(
			projectPath === undefined
				? managedRunningWhere()
				: and(managedRunningWhere(), projectPathMatches(runs.projectPath, projectPath)),
		)
		.all();
	return rows[0]?.value ?? 0;
}

function commandHasFlag(commandArgsJson: null | string, flag: string): boolean {
	if (!commandArgsJson) return false;
	try {
		const parsed: unknown = JSON.parse(commandArgsJson);
		return Array.isArray(parsed) && parsed.includes(flag);
	} catch {
		return false;
	}
}

/**
 * Inserts a managed launch as queued. Admission, not this insert, is what consumes a ceiling
 * slot: queued rows are never counted by NON_TERMINAL_RUN_STATUSES.
 */
export function insertQueuedRun(
	tx: LocalTransaction,
	args: InsertQueuedRunArgs,
): InsertQueuedRunResult {
	tx.insert(runs)
		.values({ ...args.values, pid: null, status: 'queued' })
		.run();
	return { kind: 'inserted' };
}

/**
 * Promotes the oldest queued run whose project is under its per-project ceiling, when the
 * global running count (CLI rows excluded) is below maxConcurrentRuns. FIFO is startedAt then id.
 */
export function promoteOldestQueuedRun(
	tx: LocalTransaction,
	args: PromoteOldestQueuedRunArgs,
): PromoteOldestQueuedRunResult {
	if (countManagedRunning(tx) >= args.maxConcurrentRuns) return { kind: 'none' };
	const queued = tx
		.select()
		.from(runs)
		.where(eq(runs.status, 'queued'))
		.orderBy(asc(runs.startedAt), asc(runs.id))
		.all();
	for (const row of queued) {
		const mode = row.mode as WebRunMode;
		const isolated = args.useWorktrees && mode === 'coding';
		const mutating = mayMutateProject(mode, {
			directiveReadonly: commandHasFlag(row.commandArgsJson, '--directive-readonly'),
		});
		const projectLimit = effectiveProjectRunCeiling({
			configured: args.maxConcurrentRunsPerProject,
			isolated,
			mutating,
		});
		if (countManagedRunning(tx, row.projectPath) >= projectLimit) continue;
		const worktreePath = isolated ? join(args.dataDir, 'worktrees', row.id) : null;
		const worktreeBranch = isolated ? `aidd/run-${row.id}` : null;
		const updated = tx
			.update(runs)
			.set({ status: 'running', worktreeBranch, worktreePath })
			.where(and(eq(runs.id, row.id), eq(runs.status, 'queued')))
			.returning()
			.all();
		const promoted = updated[0];
		if (!promoted) continue;
		return { kind: 'promoted', row: promoted };
	}
	return { kind: 'none' };
}

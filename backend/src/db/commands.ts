import type { DbCommands, LocalWebDatabase } from './commands/types.ts';

import { persistCycleResult } from './commands/cycles.ts';
import { reconcileDiaryEntries } from './commands/diary.ts';
import { startDirectorCycleIfIdle } from './commands/directorCycles.ts';
import { reconcileInvocationFromRun, reconcileStaleInvocations } from './commands/invocations.ts';
import { purgeProjectRuns, updateProjectPathReferences } from './commands/projectPaths.ts';
import { insertRunIfUnderCeiling } from './commands/runCeiling.ts';
import { markRunStale, reconcileDeadRun, terminalizeRun } from './commands/runHeartbeat.ts';
import { releaseRunReservation, setRunPid } from './commands/runReservation.ts';
import {
	claimScheduledTask,
	finishScheduledExecution,
	writeScheduledTask,
} from './commands/scheduledTasks.ts';

export type {
	DbCommandMap,
	DbCommandName,
	DbCommands,
	HeartbeatWriteOutcome,
	LocalWebDatabase,
} from './commands/types.ts';

// Build the command facade over a local bun:sqlite drizzle. Used directly by tests/tooling and
// inside the DB worker; the main-thread worker client provides its own postMessage-backed
// implementation of the same DbCommands type.
export function createInProcessCommands(db: LocalWebDatabase): DbCommands {
	return {
		claimScheduledTask: async (args) =>
			db.transaction((tx) => claimScheduledTask(tx, args), { behavior: 'immediate' }),
		finishScheduledExecution: async (args) =>
			db.transaction((tx) => finishScheduledExecution(tx, args), { behavior: 'immediate' }),
		insertRunIfUnderCeiling: async (args) =>
			db.transaction((tx) => insertRunIfUnderCeiling(tx, args), { behavior: 'immediate' }),
		markRunStale: async (args) =>
			db.transaction((tx) => markRunStale(tx, args), { behavior: 'immediate' }),
		persistCycleResult: async (args) => db.transaction((tx) => persistCycleResult(tx, args)),
		purgeProjectRuns: async (args) =>
			db.transaction((tx) => purgeProjectRuns(tx, args), { behavior: 'immediate' }),
		reconcileDeadRun: async (args) =>
			db.transaction((tx) => reconcileDeadRun(tx, args), { behavior: 'immediate' }),
		reconcileDiaryEntries: async (args) =>
			db.transaction((tx) => reconcileDiaryEntries(tx, args), { behavior: 'immediate' }),
		reconcileInvocationFromRun: async (args) =>
			db.transaction((tx) => reconcileInvocationFromRun(tx, args), { behavior: 'immediate' }),
		reconcileStaleInvocations: async (args) =>
			db.transaction((tx) => reconcileStaleInvocations(tx, args), { behavior: 'immediate' }),
		releaseRunReservation: async (args) =>
			db.transaction((tx) => releaseRunReservation(tx, args), { behavior: 'immediate' }),
		setRunPid: async (args) =>
			db.transaction((tx) => setRunPid(tx, args), { behavior: 'immediate' }),
		startDirectorCycleIfIdle: async (args) =>
			db.transaction((tx) => startDirectorCycleIfIdle(tx, args), { behavior: 'immediate' }),
		terminalizeRun: async (args) =>
			db.transaction((tx) => terminalizeRun(tx, args), { behavior: 'immediate' }),
		updateProjectPathReferences: async (args) =>
			db.transaction((tx) => updateProjectPathReferences(tx, args), {
				behavior: 'immediate',
			}),
		writeScheduledTask: async (args) =>
			db.transaction((tx) => writeScheduledTask(tx, args), { behavior: 'immediate' }),
	};
}

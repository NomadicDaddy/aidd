import type { directorCycles, pipelineSessions, runs } from '../../db/schema.ts';

type CycleRow = typeof directorCycles.$inferSelect;
type RunRow = typeof runs.$inferSelect;
type SessionRow = typeof pipelineSessions.$inferSelect;

export function aggregateExecutionStatus(input: {
	// A director occurrence's only child. The Director's fast path writes a cycle row and no run
	// row, so without counting cycles such an occurrence would look childless and finalize failed.
	cycles: CycleRow[];
	dispatchErrors: string[];
	runs: RunRow[];
	sessions: SessionRow[];
}): 'completed_with_failures' | 'completed' | 'failed' | 'running' {
	if (
		input.runs.some((run) => run.status === 'running') ||
		input.cycles.some((cycle) => cycle.status === 'running') ||
		input.sessions.some(
			(session) => session.status === 'queued' || session.status === 'running',
		)
	) {
		return 'running';
	}
	const successes =
		input.runs.filter((run) => run.status === 'completed').length +
		input.cycles.filter((cycle) => cycle.status === 'completed').length +
		input.sessions.filter((session) => session.status === 'completed').length;
	const attention =
		input.runs.filter((run) => run.status === 'waiting_approval').length +
		input.sessions.filter((session) => session.status === 'completed_with_failures').length;
	const failures =
		input.runs.filter((run) => ['failed', 'killed', 'stopped'].includes(run.status)).length +
		input.cycles.filter((cycle) => cycle.status === 'failed').length +
		input.sessions.filter((session) => ['failed', 'stopped'].includes(session.status)).length;
	if (successes > 0 && attention === 0 && failures === 0 && input.dispatchErrors.length === 0) {
		return 'completed';
	}
	if (successes > 0 || attention > 0) return 'completed_with_failures';
	return 'failed';
}

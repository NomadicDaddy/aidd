import type { OrchestratorDeps } from './types.ts';

// Writes an orchestrator-authored line to BOTH the operator's terminal and the run log.
//
// Lines the orchestrator prints itself — pre-run check failures, the flailing guard's banners —
// are not backend events, so nothing else carries them into `run-logs/*.log`. Without this they
// exist only on the detached CLI's stdout, which no one reads: a web run that the guard aborted
// showed a log that simply stopped, with no line explaining why (observed as an operator unable
// to tell a flailing abort from a crash). The heartbeat's raw_log writer persists the chunk.
export async function emitRunLogLine(deps: OrchestratorDeps, line: string): Promise<void> {
	process.stdout.write(`${line}\n`);
	await deps.observer?.onAgentEvent?.({
		chunk: `${line}\n`,
		stream: 'stdout',
		type: 'raw_log',
	});
}

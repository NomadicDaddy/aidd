import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

/**
 * How one failed audit session bears on the audit it held and on the run.
 *
 * - `ordinary`: the session itself failed (the agent exited non-zero, the provider returned an
 *   error, no structured result came back). It is one failed attempt at that audit, and the run
 *   goes on to its next selection.
 * - `timeout`: the backend went idle. It is also one failed attempt at that audit, but whether
 *   the run goes on is left to the run's timeout policy, which bounds consecutive timeouts.
 * - `terminal`: the failure is not this audit's. It is a stop, an interruption, a safety stop, or
 *   a condition some other gate already owns (the rate-limit wait). It is never counted against
 *   the audit, so the audit can never be given up on because of it, and it ends the run unless
 *   that gate decides otherwise.
 */
export type AuditSessionFailureKind = 'ordinary' | 'terminal' | 'timeout';

const terminalExitCodes: ReadonlySet<number> = new Set([
	orchestratorExitCodes.aborted,
	orchestratorExitCodes.flailing,
	orchestratorExitCodes.mergeConflictParked,
	orchestratorExitCodes.noAssistant,
	orchestratorExitCodes.providerFlagged,
	orchestratorExitCodes.rateLimited,
	orchestratorExitCodes.validationError,
	orchestratorExitCodes.writeAllowlistViolation,
]);

// A process ended by a signal exits with 128 plus the signal number, and Windows reports a
// console interrupt as a far larger code, so everything from here up is an interruption.
const signalExitFloor = 128;

/**
 * Classifies a failed session by its exit code. Every code the orchestrator names is placed
 * explicitly; a code it does not name is an agent's own non-zero exit and is ordinary, unless it
 * is in the range a signal produces.
 * @param exitCode The session's non-zero exit code.
 * @returns How the failure counts.
 */
export function auditSessionFailureKind(exitCode: number): AuditSessionFailureKind {
	if (exitCode === orchestratorExitCodes.idleTimeout) return 'timeout';
	if (terminalExitCodes.has(exitCode) || exitCode >= signalExitFloor) return 'terminal';
	return 'ordinary';
}

import type { AgentEvent } from 'aidd-shared/backends/types';

import { isFatalAgentError } from 'aidd-shared/backends/error-events';
import { isRateLimitText } from 'aidd-shared/backends/parsers/rate-limit-text';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import { providerErrorMessage } from '../orchestrator/details/event-accumulator.ts';

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

// A provider error carries no finer exit code, so what it was about is read from its message.
// Every alternative names a failure of the backend as a whole: the credentials are missing or
// refused, the account is out of quota or credit, or the backend CLI could not be launched. Each
// is worded so that an agent's own error text does not match it: a bare "authentication",
// "billing", or ENOENT is not here, because an audited project has authentication modules,
// billing code, and missing files of its own. A backend failure this misses is caught by count
// instead (see maxConsecutiveFailedSessions).
const backendWideFailurePattern = new RegExp(
	[
		String.raw`\bHTTP\s+(?:401|402|403)\b`,
		String.raw`\b(?:401|403)\s+(?:unauthori[sz]ed|forbidden)\b`,
		String.raw`\bunauthori[sz]ed\b`,
		String.raw`\bauthentication_error\b`,
		String.raw`\b(?:failed to authenticate|authentication (?:failed|required))\b`,
		String.raw`\b(?:not authenticated|not logged in|log ?in required)\b`,
		String.raw`\bplease (?:log ?in|sign in|run \S+ (?:auth )?login)\b`,
		String.raw`\b(?:invalid|incorrect|missing|expired|revoked) (?:api[ -]?key|x-api-key|credentials?|token)\b`,
		String.raw`\b(?:api[ -]?key|credentials?|token) (?:is |are |has )?(?:invalid|missing|expired|revoked|not set|not found)\b`,
		String.raw`\binsufficient (?:quota|credits?|balance|funds)\b`,
		String.raw`\b(?:credit balance|payment required)\b`,
		String.raw`\bspawn \S+ (?:ENOENT|EACCES)\b`,
		String.raw`\bcommand not found\b`,
		String.raw`\bnot recognized as an internal or external command\b`,
		String.raw`\bfailed to (?:spawn|launch|start)\b`,
	].join('|'),
	'i',
);

/**
 * Whether a failed session failed because of the backend as a whole and not because of the audit
 * it held. The next audit would fail the same way, so such a failure ends the run, and it is
 * never an attempt at the audit. This is the one place that decides it: audit mode asks before
 * it counts an attempt, and the orchestrator asks before it carries a run past a failure.
 * @param events The backend events of the session.
 * @returns True when the backend could not be launched, or its error names credentials, quota,
 *   credit, or a rate limit.
 */
export function isBackendWideFailure(events: readonly AgentEvent[]): boolean {
	const couldNotLaunch = events.some(
		(event) => event.type === 'error' && event.reason === 'spawn' && isFatalAgentError(event),
	);
	if (couldNotLaunch) return true;
	const message = providerErrorMessage(events) ?? '';
	return isRateLimitText(message) || backendWideFailurePattern.test(message);
}

import type { AgentEvent } from 'aidd-shared/backends/types';
import type { ModeResult } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { isFatalAgentError } from 'aidd-shared/backends/error-events';
import { isRateLimitText } from 'aidd-shared/backends/parsers/rate-limit-text';

import type { IterationDetails } from '../details.ts';

import { auditSessionFailureKind } from '../../modes/audit-session-failure.ts';

// A provider error carries no finer exit code, so what it was about is read from its message.
// These are failures of the backend as a whole: the credentials are missing or refused, the
// account is out of quota or credit, or the backend CLI could not be launched. The next audit
// would fail the same way, so the run ends here instead of spending two sessions on every audit
// left in the worklist.
const backendWideFailurePattern = new RegExp(
	[
		String.raw`\bHTTP\s+(?:401|402|403)\b`,
		String.raw`\b(?:401|403)\s+(?:unauthori[sz]ed|forbidden)\b`,
		String.raw`\bunauthori[sz]ed\b`,
		String.raw`\bauthentication`,
		String.raw`\b(?:not authenticated|not logged in|log ?in required)\b`,
		String.raw`\bplease (?:log ?in|sign in|run \S+ (?:auth )?login)\b`,
		String.raw`\b(?:invalid|incorrect|missing|expired|revoked) (?:api[ -]?key|x-api-key|credentials?|token)\b`,
		String.raw`\b(?:api[ -]?key|credentials?|token) (?:is |are |has )?(?:invalid|missing|expired|revoked|not set|not found)\b`,
		String.raw`\binsufficient (?:quota|credits?|balance|funds)\b`,
		String.raw`\b(?:credit balance|payment required|billing)\b`,
		String.raw`\b(?:ENOENT|EACCES)\b`,
		String.raw`\bcommand not found\b`,
		String.raw`\bnot recognized as an internal or external command\b`,
		String.raw`\bfailed to (?:spawn|launch|start)\b`,
	].join('|'),
	'i',
);

function isBackendWideFailure(details: IterationDetails, events: readonly AgentEvent[]): boolean {
	const couldNotLaunch = events.some(
		(event) => event.type === 'error' && event.reason === 'spawn' && isFatalAgentError(event),
	);
	if (couldNotLaunch) return true;
	const message = details.providerError?.message ?? '';
	return isRateLimitText(message) || backendWideFailurePattern.test(message);
}

/**
 * Whether a failed audit session is the audit's own failure and nothing more, so the run goes on
 * to its next selection instead of ending on the session's exit code.
 *
 * Three things must hold. Audit mode counted the session as an attempt at its audit, which is
 * what bounds the retries: two attempts and the audit is given up on. The recorded exit code is
 * an ordinary session failure, not a stop, an interruption, a safety stop, or a timeout (which
 * the run's timeout policy owns). And the failure is not about the backend as a whole.
 * @param input The iteration's plan, mode result, recorded exit code, details, and events.
 * @param input.details The iteration details carrying any provider error message.
 * @param input.events The backend events of the session.
 * @param input.modeResult What audit mode made of the session.
 * @param input.plan The run plan naming the mode.
 * @param input.recordedExitCode The exit code the iteration was recorded with.
 * @returns True when the run should carry on past this failure.
 */
export function auditSessionFailureAbsorbed(input: {
	details: IterationDetails;
	events: readonly AgentEvent[];
	modeResult: ModeResult;
	plan: RunPlan;
	recordedExitCode: number;
}): boolean {
	if (input.plan.mode !== 'audit') return false;
	if (typeof input.modeResult.artifacts?.failedAttempt !== 'number') return false;
	if (auditSessionFailureKind(input.recordedExitCode) !== 'ordinary') return false;
	return !isBackendWideFailure(input.details, input.events);
}

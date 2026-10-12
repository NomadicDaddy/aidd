import type { AgentEvent } from 'aidd-shared/backends/types';
import type { ModeResult } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import {
	auditSessionFailureKind,
	isBackendWideFailure,
} from '../../modes/audit-session-failure.ts';

/**
 * Whether a failed audit session is the audit's own failure and nothing more, so the run goes on
 * to its next selection instead of ending on the session's exit code.
 *
 * Three things must hold. Audit mode counted the session as an attempt at its audit, which is
 * what bounds the retries: two attempts and the audit is given up on. The recorded exit code is
 * an ordinary session failure, not a stop, an interruption, a safety stop, or a timeout (which
 * the run's timeout policy owns). And the failure is not about the backend as a whole, by the
 * same classifier audit mode asks before it counts an attempt.
 * @param input The iteration's plan, mode result, recorded exit code, and events.
 * @param input.events The backend events of the session.
 * @param input.modeResult What audit mode made of the session.
 * @param input.plan The run plan naming the mode.
 * @param input.recordedExitCode The exit code the iteration was recorded with.
 * @returns True when the run should carry on past this failure.
 */
export function auditSessionFailureAbsorbed(input: {
	events: readonly AgentEvent[];
	modeResult: ModeResult;
	plan: RunPlan;
	recordedExitCode: number;
}): boolean {
	if (input.plan.mode !== 'audit') return false;
	if (typeof input.modeResult.artifacts?.failedAttempt !== 'number') return false;
	if (auditSessionFailureKind(input.recordedExitCode) !== 'ordinary') return false;
	return !isBackendWideFailure(input.events);
}

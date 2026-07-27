import { describe, expect, test } from 'bun:test';
import { maxFlailIterations, maxFlailNudgeGrants } from 'aidd-shared/backends/flailing';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import type { IterationDetails } from '../../cli/src/orchestrator/details.ts';

import {
	continuableBackendInterruptionRetryLimit,
	determineRunContinuation,
} from '../../cli/src/orchestrator/run/continuation.ts';

type ContinuationInput = Parameters<typeof determineRunContinuation>[0];

const details = { outcome: { status: 'flailing' } } as IterationDetails;

const plan = {
	scope: { maxIterations: 10 },
	stopPolicy: {
		continueOnTimeout: true,
		maxConsecutiveTimeoutRetries: 2,
		quitOnAbort: 0,
		stopFile: '',
		stopWhenDone: true,
	},
} as ContinuationInput['plan'];

const timeoutDetails = {
	outcome: { status: 'provider_error' },
	providerError: { message: 'The operation timed out' },
} as IterationDetails;

function baseInput(overrides: Partial<ContinuationInput>): ContinuationInput {
	return {
		completed: false,
		completedAfterBackendInterruption: false,
		completedFeatureCount: 0,
		completedResultFeature: undefined,
		consecutiveAborts: 0,
		consecutiveContinuableInterruptions: 0,
		consecutiveFlails: 0,
		details,
		displayedSummary: 'summary',
		exitCode: orchestratorExitCodes.flailing,
		flailNudgeGrants: 0,
		plan,
		recoveredActiveVerification: false,
		stopRequestedAfterRun: false,
		...overrides,
	};
}

describe('determineRunContinuation — flailing', () => {
	test('first flail nudges and continues with a carryover note', () => {
		const result = determineRunContinuation(baseInput({ consecutiveFlails: 0 }));
		expect(result.kind).toBe('continue');
		if (result.kind === 'continue') {
			expect(result.reason).toBe('flailing_nudge');
			expect(result.consecutiveFlails).toBe(1);
			expect(result.carryoverNote).toBeTruthy();
		}
	});

	test('second consecutive flail stops the run as waiting_approval', () => {
		const result = determineRunContinuation(
			baseInput({ consecutiveFlails: maxFlailIterations - 1 }),
		);
		expect(result.kind).toBe('final');
		if (result.kind === 'final') {
			expect(result.stopReason).toBe('flailing');
			expect(result.move).toBe('complete');
			expect(result.exitCode).toBe(orchestratorExitCodes.success);
		}
	});

	// The nudge iteration isn't charged against --max-iterations (see post-iteration.ts), so this
	// grant cap — not the iteration budget — is what stops a run from nudging forever.
	test('stops once the run has spent its nudge grants', () => {
		const result = determineRunContinuation(
			baseInput({ consecutiveFlails: 0, flailNudgeGrants: maxFlailNudgeGrants }),
		);
		expect(result.kind).toBe('final');
		if (result.kind === 'final') {
			expect(result.stopReason).toBe('flailing');
			expect(result.summary).toContain(`${maxFlailNudgeGrants} corrective nudge(s)`);
		}
	});

	test('a first flail still nudges with grants remaining', () => {
		const result = determineRunContinuation(
			baseInput({ consecutiveFlails: 0, flailNudgeGrants: maxFlailNudgeGrants - 1 }),
		);
		expect(result.kind).toBe('continue');
	});

	test('a non-flailing continue resets the flail counter', () => {
		const result = determineRunContinuation(
			baseInput({
				exitCode: orchestratorExitCodes.success,
				consecutiveFlails: 1,
				details: { outcome: { status: 'success' } } as IterationDetails,
			}),
		);
		expect(result.kind).toBe('continue');
		if (result.kind === 'continue') expect(result.consecutiveFlails).toBe(0);
	});
});

describe('determineRunContinuation — classified vs backend exit code', () => {
	test('exit_error summary leads with the classification and brackets the raw backend exit', () => {
		const result = determineRunContinuation(
			baseInput({
				backendExitCode: 0,
				details: { outcome: { status: 'missing_aidd_result' } } as IterationDetails,
				exitCode: orchestratorExitCodes.missingResult,
			}),
		);
		expect(result.kind).toBe('final');
		if (result.kind === 'final') {
			expect(result.stopReason).toBe('exit_error');
			expect(result.exitCode).toBe(orchestratorExitCodes.missingResult);
			expect(result.summary).toContain('no AIDD_RESULT emitted');
			expect(result.summary).toContain('[backend exit 0]');
		}
	});
});

describe('continuableBackendInterruptionRetryLimit', () => {
	function planWith(overrides: {
		cap: null | number;
		maxIterations: null | number;
	}): ContinuationInput['plan'] {
		return {
			scope: { maxIterations: overrides.maxIterations },
			stopPolicy: {
				continueOnTimeout: true,
				maxConsecutiveTimeoutRetries: overrides.cap,
				quitOnAbort: 0,
				stopFile: '',
				stopWhenDone: true,
			},
		} as ContinuationInput['plan'];
	}

	test('caps at maxConsecutiveTimeoutRetries even when maxIterations is unlimited', () => {
		expect(
			continuableBackendInterruptionRetryLimit(planWith({ cap: 2, maxIterations: null })),
		).toBe(2);
	});

	test('takes the smaller of the cap and the iteration limit', () => {
		expect(
			continuableBackendInterruptionRetryLimit(planWith({ cap: 5, maxIterations: 3 })),
		).toBe(3);
		expect(
			continuableBackendInterruptionRetryLimit(planWith({ cap: 2, maxIterations: 10 })),
		).toBe(2);
	});

	test('a null cap falls back to the iteration limit (legacy behavior)', () => {
		expect(
			continuableBackendInterruptionRetryLimit(planWith({ cap: null, maxIterations: null })),
		).toBeNull();
		expect(
			continuableBackendInterruptionRetryLimit(planWith({ cap: null, maxIterations: 4 })),
		).toBe(4);
	});
});

describe('determineRunContinuation — provider-timeout retries', () => {
	test('retries a continuable timeout below the cap', () => {
		const result = determineRunContinuation(
			baseInput({
				consecutiveContinuableInterruptions: 1,
				details: timeoutDetails,
				exitCode: orchestratorExitCodes.providerError,
			}),
		);
		expect(result.kind).toBe('continue');
		if (result.kind === 'continue') {
			expect(result.reason).toBe('continuable_backend_interruption');
		}
	});

	test('stops once the consecutive-timeout cap is reached', () => {
		const result = determineRunContinuation(
			baseInput({
				consecutiveContinuableInterruptions: 2,
				details: timeoutDetails,
				exitCode: orchestratorExitCodes.providerError,
			}),
		);
		expect(result.kind).toBe('final');
		if (result.kind === 'final') {
			expect(result.stopReason).toBe('exit_error');
			expect(result.summary).toContain('retry limit reached (2)');
		}
	});
});

describe('windDownNote', () => {
	test('names the remaining minutes and the commit-now instructions', async () => {
		const { windDownNote } = await import('../../cli/src/orchestrator/run/carryover-notes.ts');
		const note = windDownNote(9 * 60 * 1000);
		expect(note).toContain('about 9 minute(s)');
		expect(note).toContain('git commit');
		expect(note).toContain('AIDD_RESULT');
	});

	test('floors sub-minute remainders to one minute', async () => {
		const { windDownNote } = await import('../../cli/src/orchestrator/run/carryover-notes.ts');
		expect(windDownNote(30_000)).toContain('about 1 minute(s)');
	});

	// The marker means "completed and verified". A deadline does not lower that bar, and telling the
	// agent to emit one unconditionally invites a claimed completion it cannot stand behind.
	test('conditions the marker on genuine completion rather than the deadline', async () => {
		const { windDownNote } = await import('../../cli/src/orchestrator/run/carryover-notes.ts');
		const note = windDownNote(5 * 60 * 1000);
		expect(note).toContain('only');
		expect(note).toContain('genuinely completed and verified');
		expect(note).toContain('emit no marker');
	});
});

// Both carryover notes are injected into the next iteration's prompt, so they are runtime
// instructions competing with prompts/coding.md. The flailing path is the blocked-server scenario
// the STOP-AND-PARK hatch exists for: an instruction to park *and* emit AIDD_RESULT contradicts the
// result contract and reproduces the missing_aidd_result failure the park handling was added to fix.
describe('flailingNudgeNote', () => {
	test('tells the agent to park without emitting a completion marker', async () => {
		const { flailingNudgeNote } =
			await import('../../cli/src/orchestrator/run/carryover-notes.ts');
		const note = flailingNudgeNote();
		expect(note).toContain('waiting_approval');
		expect(note).toContain('live verification was blocked');
		expect(note).toContain('Do **not** emit `AIDD_RESULT`');
		expect(note).not.toMatch(/and emit `AIDD_RESULT`/);
	});
});

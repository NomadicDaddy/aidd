import { describe, expect, test } from 'bun:test';
import type { AgentEvent } from 'aidd-shared/backends/types';
import type { ModeResult } from 'aidd-shared/modes/types';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import type { IterationDetails } from '../../cli/src/orchestrator/details.ts';

import {
	auditSessionFailureKind,
	isBackendWideFailure,
} from '../../cli/src/modes/audit-session-failure.ts';
import { auditSessionFailureAbsorbed } from '../../cli/src/orchestrator/run/audit-session-absorption.ts';
import { determineRunContinuation } from '../../cli/src/orchestrator/run/continuation.ts';

type ContinuationInput = Parameters<typeof determineRunContinuation>[0];
type AbsorptionInput = Parameters<typeof auditSessionFailureAbsorbed>[0];

const auditPlan = {
	mode: 'audit',
	scope: { maxIterations: 10 },
	stopPolicy: {
		continueOnTimeout: true,
		maxConsecutiveTimeoutRetries: 2,
		quitOnAbort: 0,
		stopFile: '',
		stopWhenDone: true,
	},
} as ContinuationInput['plan'];

const providerFailure = { outcome: { status: 'provider_error' } } as IterationDetails;

function providerFailureSaying(message: string): IterationDetails {
	return {
		outcome: { status: 'provider_error' },
		providerError: { message },
	} as IterationDetails;
}

const countedAttempt: ModeResult = {
	artifacts: { failedAttempt: 1 },
	complete: false,
	summary: 'audit SECURITY did not complete',
};

// The session events a provider error with this message arrives as.
function providerErrorSaying(message: string): AgentEvent[] {
	return [{ meta: { message }, reason: 'provider', type: 'error' }];
}

function absorption(overrides: Partial<AbsorptionInput>): AbsorptionInput {
	return {
		events: [],
		modeResult: countedAttempt,
		plan: auditPlan,
		recordedExitCode: orchestratorExitCodes.providerError,
		...overrides,
	};
}

function continuation(overrides: Partial<ContinuationInput>): ContinuationInput {
	return {
		completed: false,
		completedAfterBackendInterruption: false,
		completedFeatureCount: 0,
		completedResultFeature: undefined,
		consecutiveAborts: 0,
		consecutiveContinuableInterruptions: 0,
		consecutiveFlails: 0,
		details: providerFailure,
		displayedSummary: 'summary',
		exitCode: orchestratorExitCodes.providerError,
		flailNudgeGrants: 0,
		plan: auditPlan,
		recoveredActiveVerification: false,
		stopRequestedAfterRun: false,
		...overrides,
	};
}

// The whole classification, one row per exit code the orchestrator names. A code added to the
// vocabulary without a row here falls to "ordinary", so this table is where it gets decided.
describe('auditSessionFailureKind', () => {
	const expected: Record<keyof typeof orchestratorExitCodes, string> = {
		aborted: 'terminal',
		flailing: 'terminal',
		generalError: 'ordinary',
		idleTimeout: 'timeout',
		mergeConflictParked: 'terminal',
		missingResult: 'ordinary',
		noAssistant: 'terminal',
		providerError: 'ordinary',
		providerFlagged: 'terminal',
		rateLimited: 'terminal',
		success: 'ordinary',
		validationError: 'terminal',
		writeAllowlistViolation: 'terminal',
	};

	test('places every exit code the orchestrator names', () => {
		for (const [name, code] of Object.entries(orchestratorExitCodes)) {
			expect(`${name}: ${auditSessionFailureKind(code)}`).toBe(
				`${name}: ${expected[name as keyof typeof orchestratorExitCodes]}`,
			);
		}
	});

	test("an agent's own non-zero exit is ordinary and a signal death is an interruption", () => {
		expect(auditSessionFailureKind(2)).toBe('ordinary');
		expect(auditSessionFailureKind(127)).toBe('ordinary');
		expect(auditSessionFailureKind(130)).toBe('terminal');
		expect(auditSessionFailureKind(137)).toBe('terminal');
		expect(auditSessionFailureKind(3_221_225_786)).toBe('terminal');
	});
});

describe('auditSessionFailureAbsorbed', () => {
	test('absorbs an ordinary failure audit mode counted as an attempt', () => {
		expect(auditSessionFailureAbsorbed(absorption({}))).toBe(true);
		for (const recordedExitCode of [
			orchestratorExitCodes.generalError,
			orchestratorExitCodes.missingResult,
			2,
		]) {
			expect(auditSessionFailureAbsorbed(absorption({ recordedExitCode }))).toBe(true);
		}
	});

	test('never absorbs a failure outside audit mode or one no attempt was counted for', () => {
		const codingPlan = { ...auditPlan, mode: 'coding' } as AbsorptionInput['plan'];
		expect(auditSessionFailureAbsorbed(absorption({ plan: codingPlan }))).toBe(false);
		const uncounted: ModeResult = { artifacts: {}, complete: false, summary: 'uncounted' };
		expect(auditSessionFailureAbsorbed(absorption({ modeResult: uncounted }))).toBe(false);
	});

	test('never absorbs a stop, an interruption, a safety stop, or a timeout', () => {
		for (const recordedExitCode of [
			orchestratorExitCodes.aborted,
			orchestratorExitCodes.flailing,
			orchestratorExitCodes.idleTimeout,
			orchestratorExitCodes.noAssistant,
			orchestratorExitCodes.providerFlagged,
			orchestratorExitCodes.rateLimited,
			orchestratorExitCodes.validationError,
			orchestratorExitCodes.writeAllowlistViolation,
			143,
		]) {
			expect(auditSessionFailureAbsorbed(absorption({ recordedExitCode }))).toBe(false);
		}
	});

	test('never absorbs a failure of the backend as a whole', () => {
		const events = providerErrorSaying('HTTP 401 Unauthorized');
		expect(auditSessionFailureAbsorbed(absorption({ events }))).toBe(false);
		const couldNotLaunch: AgentEvent[] = [{ reason: 'spawn', type: 'error' }];
		expect(auditSessionFailureAbsorbed(absorption({ events: couldNotLaunch }))).toBe(false);
	});

	test('absorbs a provider error that is about the request and not the backend', () => {
		const events = providerErrorSaying('HTTP 500 Internal Server Error');
		expect(auditSessionFailureAbsorbed(absorption({ events }))).toBe(true);
	});
});

// The one classifier audit mode and the orchestrator both ask. Each row is a message as the
// provider error carries it; the label says which alternative of the pattern it exercises.
describe('isBackendWideFailure', () => {
	const backendWide: [alternative: string, message: string][] = [
		['HTTP 401', 'HTTP 401 Unauthorized'],
		['HTTP 402', 'HTTP 402 from the provider'],
		['HTTP 403', 'request failed: HTTP 403'],
		['status and reason', 'Error: 403 Forbidden'],
		['unauthorized', 'Unauthorised: the request was refused'],
		['authentication_error', '{"type":"error","error":{"type":"authentication_error"}}'],
		['authentication failed', 'Authentication failed for the configured provider'],
		['authentication required', 'authentication required'],
		['failed to authenticate', 'Failed to authenticate with the API'],
		['not authenticated', 'You are not authenticated'],
		['not logged in', 'Not logged in'],
		['login required', 'Login required to continue'],
		['please log in', 'Please log in and try again'],
		['please run login', 'Invalid API key. Please run claude login'],
		['invalid key', 'invalid x-api-key'],
		['missing credentials', 'Missing credentials for provider'],
		['expired token', 'expired token'],
		['token has expired', 'OAuth token has expired'],
		['key not set', 'API key is not set'],
		['insufficient quota', 'You have insufficient quota for this request.'],
		['insufficient credits', 'Insufficient credits'],
		['credit balance', 'Your credit balance is too low to access the API'],
		['payment required', '402 Payment Required'],
		['spawn error text', 'spawn codex ENOENT'],
		['spawn permission text', 'Error: spawn /usr/local/bin/claude EACCES'],
		['command not found', 'claude: command not found'],
		[
			'not recognized',
			"'codex' is not recognized as an internal or external command, operable program or batch file.",
		],
		['failed to launch', 'Failed to launch the backend process'],
		['rate limit text', 'You have hit your usage limit'],
		['rate limit status', 'HTTP 429 Too Many Requests'],
	];

	test.each(backendWide)('%s is a failure of the backend as a whole', (_alternative, message) => {
		expect(isBackendWideFailure(providerErrorSaying(message))).toBe(true);
	});

	// The three terms that were too broad: each of these is an agent's or the audited project's
	// own text, and none of them says anything about the backend.
	const notBackendWide: [term: string, message: string][] = [
		['bare authentication', 'TypeError in authentication module: user is undefined'],
		['bare authentication', 'the authentication flow has no rate limiting test'],
		['bare billing', 'billing service tests failed: 3 of 40'],
		['bare ENOENT', "ENOENT: no such file or directory, open 'coverage/lcov.info'"],
		['bare EACCES', "EACCES: permission denied, mkdir '/var/reports'"],
		['request error', 'HTTP 500 Internal Server Error'],
		['empty response', 'The model returned an empty response'],
		['turn limit', 'max turns reached: 40'],
		['context limit', 'context length exceeded'],
	];

	test.each(notBackendWide)('%s is not a failure of the backend', (_term, message) => {
		expect(isBackendWideFailure(providerErrorSaying(message))).toBe(false);
	});

	test('a backend that could not be launched is backend-wide whatever its text says', () => {
		expect(isBackendWideFailure([{ reason: 'spawn', type: 'error' }])).toBe(true);
		expect(isBackendWideFailure([])).toBe(false);
	});

	// A parser-recognized advisory is not an error of the session, so its wording decides nothing.
	test('a nonfatal advisory never classifies the session', () => {
		const advisory: AgentEvent[] = [
			{ fatal: false, meta: { message: 'HTTP 401' }, reason: 'provider', type: 'error' },
			{ fatal: false, reason: 'spawn', type: 'error' },
		];
		expect(isBackendWideFailure(advisory)).toBe(false);
	});
});

describe('determineRunContinuation — audit sessions', () => {
	test('an unabsorbed failure still ends the run on its exit code', () => {
		const result = determineRunContinuation(continuation({}));
		expect(result).toMatchObject({
			exitCode: orchestratorExitCodes.providerError,
			kind: 'final',
			stopReason: 'exit_error',
		});
	});

	test('an absorbed failure goes on to the next selection', () => {
		const result = determineRunContinuation(
			continuation({ auditSessionFailureAbsorbed: true }),
		);
		expect(result).toMatchObject({ kind: 'continue', reason: 'normal' });
	});

	test('a stop request outranks an absorbed failure', () => {
		const result = determineRunContinuation(
			continuation({ auditSessionFailureAbsorbed: true, stopRequestedAfterRun: true }),
		);
		expect(result).toMatchObject({ kind: 'final', stopReason: 'stop_requested' });
	});

	test('a finished run ends the way the mode asks when not everything succeeded', () => {
		const ending = { exitCode: 0, stopReason: 'partial_success_blocked' } as const;
		const afterFailure = determineRunContinuation(
			continuation({
				auditSessionFailureAbsorbed: true,
				completed: true,
				unsuccessfulEnding: ending,
			}),
		);
		expect(afterFailure).toMatchObject({ ...ending, kind: 'final', summary: 'summary' });
		const afterSuccess = determineRunContinuation(
			continuation({
				completed: true,
				exitCode: orchestratorExitCodes.success,
				unsuccessfulEnding: ending,
			}),
		);
		expect(afterSuccess).toMatchObject({ ...ending, kind: 'final' });
		const clean = determineRunContinuation(
			continuation({ completed: true, exitCode: orchestratorExitCodes.success }),
		);
		expect(clean).toMatchObject({ exitCode: 0, kind: 'final', stopReason: 'completed' });
	});

	// The timeout policy keeps its say over a transient provider error: it is retried under the
	// consecutive limit first, and that limit still ends a run whose backend stopped answering.
	test('a transient provider error stays under the timeout retry limit', () => {
		const details = providerFailureSaying('The operation timed out');
		const retried = determineRunContinuation(
			continuation({ auditSessionFailureAbsorbed: true, details }),
		);
		expect(retried).toMatchObject({
			kind: 'continue',
			reason: 'continuable_backend_interruption',
		});
		const exhausted = determineRunContinuation(
			continuation({
				auditSessionFailureAbsorbed: true,
				consecutiveContinuableInterruptions: 2,
				details,
			}),
		);
		expect(exhausted).toMatchObject({ kind: 'final', stopReason: 'exit_error' });
	});
});

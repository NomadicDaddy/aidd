import type { WebRunOutcome } from './outcome.ts';

import { orchestratorExitCodes } from '../orchestrator/exit-codes.ts';

// The web heartbeat reaper stores -1 when no child-process exit status exists. Keep that sentinel
// out of every operator-facing exit-code surface while preserving real non-negative statuses,
// including unknown ones that the detail panel should still report verbatim.
export function isProcessExitCode(exitCode: null | number | undefined): exitCode is number {
	return (
		exitCode !== null && exitCode !== undefined && Number.isInteger(exitCode) && exitCode >= 0
	);
}

// Maps a known orchestrator exit code to a human-readable outcome. The orchestrator rewrites the
// recorded exit code to one of these named values, so a bare number like 73 carries a precise
// meaning that the generic 'exit_error' stop reason hides. Returns null for unmapped codes so
// callers fall back to their generic error copy.
export function decodeExitCode(exitCode: null | number | undefined): null | WebRunOutcome {
	if (!isProcessExitCode(exitCode)) return null;
	switch (exitCode) {
		case orchestratorExitCodes.aborted:
			return {
				label: 'Aborted',
				title: 'Run was aborted (kill/stop or hard timeout).',
				tone: 'neutral',
			};
		case orchestratorExitCodes.flailing:
			return {
				label: 'Flailing guard',
				title: 'The agent repeated non-productive actions without progress; the run was stopped and its feature parked for review.',
				tone: 'red',
			};
		case orchestratorExitCodes.generalError:
			return {
				label: 'Error',
				title: 'Run ended with a general error.',
				tone: 'red',
			};
		case orchestratorExitCodes.idleTimeout:
			return {
				label: 'Idle timeout',
				title: 'Backend went idle and was stopped.',
				tone: 'amber',
			};
		case orchestratorExitCodes.missingResult:
			return {
				label: 'No result emitted',
				title: 'Backend exited without emitting AIDD_RESULT — usually a self-abort before doing work.',
				tone: 'red',
			};
		case orchestratorExitCodes.noAssistant:
			return {
				label: 'No assistant',
				title: 'Backend produced no assistant response.',
				tone: 'red',
			};
		case orchestratorExitCodes.providerError:
			return {
				label: 'Provider error',
				title: 'The model provider returned an error (network, 5xx, or parse failure).',
				tone: 'red',
			};
		case orchestratorExitCodes.providerFlagged:
			return {
				label: 'Provider flagged',
				title: 'The model provider refused the request on content-policy grounds (the response was flagged). Rephrase the prompt or use a provider/account authorized for this content.',
				tone: 'red',
			};
		case orchestratorExitCodes.rateLimited:
			return {
				label: 'Rate limited',
				title: 'Run stopped after hitting provider rate limits.',
				tone: 'amber',
			};
		case orchestratorExitCodes.validationError:
			return {
				label: 'Validation failed',
				title: 'A validation gate failed.',
				tone: 'red',
			};
		default:
			return null;
	}
}

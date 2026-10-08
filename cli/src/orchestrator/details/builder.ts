import type { AgentEvent } from 'aidd-shared/backends/types';
import type { SelectedWork } from 'aidd-shared/modes/types';

import type { IterationDetails, IterationDetailsSummary } from './types.ts';

import {
	createEventAccumulator,
	recordAgentError,
	recordToolCall,
	recordToolResult,
} from './event-accumulator.ts';
import {
	activeVerificationRecoveryFor,
	detectActiveVerificationTimeout,
	detectVerificationLifecycleConflict,
	pickOutcomeStatus,
} from './outcome.ts';
import {
	asksUserDecisionInProse,
	eventTextForClassification,
	isAskUserQuestionEvent,
	uniqueOrdered,
} from './shared.ts';

interface OutcomeFlags {
	completionPendingCommit?: boolean;
	findingsContractDropped?: boolean;
	missingAiddResult?: boolean;
	missingAuditArtifacts?: boolean;
	residualDirtyFilesCount?: number;
}

export function extractIterationDetails(
	events: AgentEvent[],
	exitCode: number,
	work?: SelectedWork,
	flags?: OutcomeFlags,
): IterationDetails {
	// Each event type has its own recorder; this loop only routes. The totals read below are the
	// accumulator's fields, so the summary and outcome assembly that follow are unchanged.
	const acc = createEventAccumulator();
	for (const event of events) {
		if (event.type === 'tool_call') recordToolCall(acc, event);
		else if (event.type === 'tool_result') recordToolResult(acc, event);
		else if (event.type === 'error') recordAgentError(acc, event);
	}
	const {
		advisories,
		commands,
		commandStatusEvidence,
		errors,
		failedCommands,
		filesCreated,
		filesEdited,
		filesRead,
		finalChecks,
		providerError,
	} = acc;

	const uniqueRead = uniqueOrdered(filesRead);
	const uniqueEdited = uniqueOrdered(filesEdited);
	const uniqueCreated = uniqueOrdered(filesCreated);
	const totalToolCalls = events.filter((event) => event.type === 'tool_call').length;
	const summary: IterationDetailsSummary = {
		bashCommandsRun: commands.length,
		finalChecks,
		hasBuildErrors: errors.some((entry) => entry.type === 'build'),
		hasLintErrors: errors.some((entry) => entry.type === 'lint'),
		hasTypeErrors: errors.some((entry) => entry.type === 'typescript'),
		totalToolCalls,
		uniqueFilesCreated: uniqueCreated.length,
		uniqueFilesEdited: uniqueEdited.length,
		uniqueFilesRead: uniqueRead.length,
	};
	const details: IterationDetails = {
		commands,
		commandStatusEvidence,
		errors,
		failedCommands: uniqueOrdered(failedCommands),
		filesCreated: uniqueCreated,
		filesEdited: uniqueEdited,
		filesRead: uniqueRead,
		outcome: buildOutcome(commands, events, exitCode, flags),
		summary,
	};
	if (providerError) details.providerError = providerError;
	if (advisories.length > 0) details.advisories = uniqueOrdered(advisories);

	if (work?.kind === 'feature') {
		details.featureSlug = work.id;
		details.featureDescription = work.description;
	}

	return details;
}

// Every flag the caller left out reads as absent.
function settledFlags(flags: OutcomeFlags | undefined): Required<OutcomeFlags> {
	return {
		completionPendingCommit: flags?.completionPendingCommit ?? false,
		findingsContractDropped: flags?.findingsContractDropped ?? false,
		missingAiddResult: flags?.missingAiddResult ?? false,
		missingAuditArtifacts: flags?.missingAuditArtifacts ?? false,
		residualDirtyFilesCount: flags?.residualDirtyFilesCount ?? 0,
	};
}

// The outcome is the one place the iteration's detections meet its flags; the three detections
// are ordered (a lifecycle conflict pre-empts an active-verification timeout) and the optional
// members are present only when they carry a value, which is what the DTO's consumers test.
function buildOutcome(
	commands: string[],
	events: AgentEvent[],
	exitCode: number,
	flags: OutcomeFlags | undefined,
): IterationDetails['outcome'] {
	const verificationLifecycleConflict = detectVerificationLifecycleConflict(
		commands,
		events,
		exitCode,
	);
	const activeVerificationTimeout =
		verificationLifecycleConflict === undefined
			? detectActiveVerificationTimeout(commands, events, exitCode)
			: undefined;
	const activeVerificationRecovery = activeVerificationRecoveryFor(activeVerificationTimeout);
	const blockedNeedsUserInput = asksForUserInput(events);
	const settled = settledFlags(flags);
	const blockedDirtyWorktree =
		blockedNeedsUserInput &&
		settled.residualDirtyFilesCount > 0 &&
		hasDirtyWorktreeEvidence(events, commands);
	return {
		exitCode,
		status: pickOutcomeStatus({
			activeVerificationRecovery,
			activeVerificationTimeout,
			blockedDirtyWorktree,
			blockedNeedsUserInput,
			completionPendingCommit: settled.completionPendingCommit,
			exitCode,
			findingsContractDropped: settled.findingsContractDropped,
			missingAiddResult: settled.missingAiddResult,
			missingAuditArtifacts: settled.missingAuditArtifacts,
			verificationLifecycleConflict,
		}),
		...(activeVerificationTimeout === undefined ? {} : { activeVerificationTimeout }),
		...(activeVerificationRecovery === undefined ? {} : { activeVerificationRecovery }),
		...(verificationLifecycleConflict === undefined ? {} : { verificationLifecycleConflict }),
	};
}

function asksForUserInput(events: AgentEvent[]): boolean {
	return events.some(isAskUserQuestionEvent) || asksUserDecisionInProse(events);
}

function hasDirtyWorktreeEvidence(events: AgentEvent[], commands: string[]): boolean {
	return (
		commands.some((command) => dirtyWorktreePattern.test(command)) ||
		events.some((event) => {
			if (event.type === 'tool_call') return dirtyWorktreePattern.test(stringify(event.args));
			const text = eventTextForClassification(event);
			return text !== undefined && dirtyWorktreePattern.test(text);
		})
	);
}

const dirtyWorktreePattern =
	/\b(?:dirty|worktree|working tree|git status|git diff|uncommitted|changes not staged|unstaged|untracked)\b/i;

function stringify(value: unknown): string {
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value);
	} catch {
		return '';
	}
}

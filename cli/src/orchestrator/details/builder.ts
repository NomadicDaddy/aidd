import type { AgentEvent } from 'aidd-shared/backends/types';
import type { SelectedWork } from 'aidd-shared/modes/types';

import { agentErrorFatality } from 'aidd-shared/backends/error-events';
import {
	bashToolPattern,
	commandFromArgs,
	editToolPattern,
	pathFromArgs,
	readToolPattern,
	writeToolPattern,
} from 'aidd-shared/orchestrator/details/tool-args';

import type {
	FinalCheckSummary,
	IterationDetails,
	IterationDetailsSummary,
	IterationError,
} from './types.ts';

import {
	classifyErrorText,
	classifyFinalCheckCommand,
	cleanProviderMessage,
	commandMatchesErrorType,
	commandOutputFailed,
	commandStatusKnown,
	finalCheckStatusFromOutput,
	isProviderExitFallbackMeta,
	providerErrorText,
	requestIdFromProviderText,
} from './classification.ts';
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

export function extractIterationDetails(
	events: AgentEvent[],
	exitCode: number,
	work?: SelectedWork,
	flags?: {
		completionPendingCommit?: boolean;
		findingsContractDropped?: boolean;
		missingAiddResult?: boolean;
		missingAuditArtifacts?: boolean;
		residualDirtyFilesCount?: number;
	}
): IterationDetails {
	const filesRead: string[] = [];
	const filesEdited: string[] = [];
	const filesCreated: string[] = [];
	const commands: string[] = [];
	const errors: IterationError[] = [];
	const failedCommands: string[] = [];
	const finalChecks: FinalCheckSummary = {};
	let commandStatusEvidence = false;
	let pendingCommand: string | undefined;
	let providerError:
		| {
				message: string;
				requestId?: string;
		  }
		| undefined;
	let providerErrorPriority = -1;

	for (const event of events) {
		if (event.type === 'tool_call') {
			if (readToolPattern.test(event.tool)) {
				const path = pathFromArgs(event.args);
				if (path) filesRead.push(path);
			} else if (writeToolPattern.test(event.tool)) {
				const path = pathFromArgs(event.args);
				if (path) filesCreated.push(path);
			} else if (editToolPattern.test(event.tool)) {
				const path = pathFromArgs(event.args);
				if (path) filesEdited.push(path);
			} else if (bashToolPattern.test(event.tool)) {
				const command = commandFromArgs(event.args);
				if (command) {
					commands.push(command);
					pendingCommand = command;
				}
			}
		} else if (event.type === 'tool_result') {
			const text = eventTextForClassification(event);
			if (text !== undefined) {
				const resultCommand = pendingCommand;
				if (resultCommand !== undefined) {
					const check = classifyFinalCheckCommand(resultCommand);
					const status =
						event.exitCode === undefined
							? finalCheckStatusFromOutput(text)
							: event.exitCode === 0
								? 'passed'
								: 'failed';
					if (check !== undefined && status !== undefined) finalChecks[check] = status;
					pendingCommand = undefined;
				}
				if (
					resultCommand !== undefined &&
					(event.exitCode !== undefined || commandStatusKnown(text))
				) {
					commandStatusEvidence = true;
				}
				const errorType = classifyErrorText(text);
				const failedByExit =
					event.exitCode === undefined ? commandOutputFailed(text) : event.exitCode !== 0;
				const failedByDiagnostic =
					event.exitCode === undefined &&
					resultCommand !== undefined &&
					errorType !== undefined &&
					commandMatchesErrorType(resultCommand, errorType);
				if (resultCommand !== undefined && (failedByExit || failedByDiagnostic)) {
					failedCommands.push(resultCommand);
				}
				if ((failedByExit || failedByDiagnostic) && errorType !== undefined) {
					errors.push({
						message: text.slice(0, 500),
						type: errorType,
					});
				}
			}
		} else if (event.type === 'error') {
			const fatality = agentErrorFatality(event);
			// A nonfatal event is one a parser explicitly recognized as a known-benign advisory
			// (e.g. codex's skills-context-budget notice), so it never explains an outcome and is
			// dropped whatever the exit code. Reporting it as the provider error made advisories
			// masquerade as the cause of any non-success run that emitted nothing else — a run
			// that failed on missing_aidd_result read as "provider error: Skill descriptions were
			// shortened…". No provider error at all is the honest answer in that case.
			if (fatality === 'nonfatal') continue;
			const text = eventTextForClassification(event) ?? event.reason;
			const classified = classifyErrorText(text);
			if (event.reason === 'provider') {
				const isExitFallback = isProviderExitFallbackMeta(event.meta);
				const priority = isExitFallback ? 0 : fatality === 'unspecified' ? 1 : 2;
				// The generic {exitCode, stderr} error the parsers emit on process
				// exit trails provider diagnostics. Unspecified item errors outrank it,
				// while an explicitly fatal terminal error (codex turn.failed) outranks both.
				if (priority > providerErrorPriority) {
					const providerText = providerErrorText(event.meta) ?? text;
					providerError = {
						message: cleanProviderMessage(providerText),
					};
					const requestId =
						requestIdFromProviderText(providerText) ?? requestIdFromProviderText(text);
					if (requestId !== undefined) providerError.requestId = requestId;
					providerErrorPriority = priority;
				}
			}
			errors.push({
				message: text.slice(0, 500),
				type: event.reason === 'provider' ? 'provider' : (classified ?? 'general'),
			});
		}
	}

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
	const verificationLifecycleConflict = detectVerificationLifecycleConflict(
		commands,
		events,
		exitCode
	);
	const activeVerificationTimeout =
		verificationLifecycleConflict === undefined
			? detectActiveVerificationTimeout(commands, events, exitCode)
			: undefined;
	const activeVerificationRecovery = activeVerificationRecoveryFor(activeVerificationTimeout);
	const blockedNeedsUserInput = asksForUserInput(events);
	const blockedDirtyWorktree =
		blockedNeedsUserInput &&
		(flags?.residualDirtyFilesCount ?? 0) > 0 &&
		hasDirtyWorktreeEvidence(events, commands);

	const details: IterationDetails = {
		commands,
		commandStatusEvidence,
		errors,
		failedCommands: uniqueOrdered(failedCommands),
		filesCreated: uniqueCreated,
		filesEdited: uniqueEdited,
		filesRead: uniqueRead,
		outcome: {
			exitCode,
			status: pickOutcomeStatus({
				activeVerificationRecovery,
				activeVerificationTimeout,
				blockedDirtyWorktree,
				blockedNeedsUserInput,
				completionPendingCommit: flags?.completionPendingCommit ?? false,
				exitCode,
				findingsContractDropped: flags?.findingsContractDropped ?? false,
				missingAiddResult: flags?.missingAiddResult ?? false,
				missingAuditArtifacts: flags?.missingAuditArtifacts ?? false,
				verificationLifecycleConflict,
			}),
			...(activeVerificationTimeout === undefined ? {} : { activeVerificationTimeout }),
			...(activeVerificationRecovery === undefined ? {} : { activeVerificationRecovery }),
			...(verificationLifecycleConflict === undefined
				? {}
				: { verificationLifecycleConflict }),
		},
		summary,
	};
	if (providerError) details.providerError = providerError;

	if (work?.kind === 'feature') {
		details.featureSlug = work.id;
		details.featureDescription = work.description;
	}

	return details;
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

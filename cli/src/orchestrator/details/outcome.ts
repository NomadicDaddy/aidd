import type { AgentEvent } from 'aidd-shared/backends/types';

import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import type {
	ActiveVerificationRecovery,
	ActiveVerificationTimeout,
	IterationOutcomeStatus,
	VerificationLifecycleConflict,
} from './types.ts';

import { eventTextForClassification, uniqueOrdered } from './shared.ts';

const lifecycleCommandPattern =
	/\b(?:bun|npm|pnpm|yarn)\s+run\s+(?:smoke:dev|smoke:preview|start|stop|dev)\b|\b(?:agent-browser|crawltest|playwright)\b/i;
const lifecycleOwnerPattern =
	/\b(?:bun|npm|pnpm|yarn)\s+run\s+(?:smoke:dev|smoke:preview|start|stop|dev)\b/i;
const broadLifecycleSmokePattern =
	/\b(?:bun|npm|pnpm|yarn)\s+run\s+(?:smoke:dev|smoke:preview|start|dev)\b/i;
const browserVerificationPattern = /\b(?:agent-browser|crawltest|playwright)\b/i;
const serverUnavailablePattern =
	/ECONNREFUSED|connection refused|backend unavailable|server unavailable|failed to fetch|ERR_CONNECTION_REFUSED/i;
const activeVerificationTextPattern =
	/\b(?:running|starting|started|checking|verifying|executing|launching|about to run)\b.*\b(?:verif(?:y|ication)|smoke|typecheck|lint|test|browser|crawltest|agent-browser|playwright)\b/i;
const targetedVerificationPassedPattern =
	/\b(?:(?:targeted|focused|route|browser|crawl|smoke:qc|typecheck|lint|format|checks?)\b.{0,80}\b(?:passed|pass|clean|zero console|zero network|succeeded)|(?:passed|clean|succeeded)\b.{0,80}\b(?:targeted|focused|route|browser|crawl|smoke:qc|typecheck|lint|format|checks?))\b/i;
const completedResultPattern = /AIDD_RESULT:\s*\{/;
const inlineCommandPattern =
	/`([^`]*(?:bun|npm|pnpm|yarn|agent-browser|crawltest|playwright)[^`]*)`/gi;

export function pickOutcomeStatus(args: {
	activeVerificationRecovery: unknown;
	activeVerificationTimeout: unknown;
	blockedDirtyWorktree?: boolean;
	blockedNeedsUserInput?: boolean;
	completionPendingCommit?: boolean;
	exitCode: number;
	findingsContractDropped?: boolean;
	missingAiddResult?: boolean;
	missingAuditArtifacts?: boolean;
	verificationLifecycleConflict: unknown;
}): IterationOutcomeStatus {
	if (args.verificationLifecycleConflict !== undefined) return 'verification_lifecycle_conflict';
	if (args.activeVerificationRecovery !== undefined) return 'active_verification_recovery';
	if (args.activeVerificationTimeout !== undefined) return 'active_verification_timeout';
	if (args.blockedDirtyWorktree === true) return 'blocked_dirty_worktree';
	if (args.blockedNeedsUserInput === true) return 'blocked_needs_user_input';
	if (args.completionPendingCommit === true) return 'completion_pending_commit';
	if (args.missingAuditArtifacts === true) return 'missing_audit_artifacts';
	if (args.findingsContractDropped === true) return 'audit_findings_contract_dropped';
	if (args.missingAiddResult === true) return 'missing_aidd_result';
	return outcomeStatusForExitCode(args.exitCode);
}

function outcomeStatusForExitCode(exitCode: number): IterationOutcomeStatus {
	switch (exitCode) {
		case orchestratorExitCodes.aborted:
			return 'aborted';
		case orchestratorExitCodes.flailing:
			return 'flailing';
		case orchestratorExitCodes.idleTimeout:
			return 'idle_timeout';
		case orchestratorExitCodes.noAssistant:
			return 'no_assistant';
		case orchestratorExitCodes.providerError:
			return 'provider_error';
		case orchestratorExitCodes.rateLimited:
			return 'rate_limited';
		case orchestratorExitCodes.success:
			return 'success';
		case orchestratorExitCodes.validationError:
			return 'validation_error';
		default:
			return 'failure';
	}
}

export function detectVerificationLifecycleConflict(
	commands: string[],
	events: AgentEvent[],
	exitCode: number
): undefined | VerificationLifecycleConflict {
	if (exitCode !== orchestratorExitCodes.idleTimeout) return undefined;
	const verificationCommands = commands.filter((command) =>
		lifecycleCommandPattern.test(command)
	);
	if (verificationCommands.length === 0) return undefined;
	const hasLifecycleOwner = verificationCommands.some((command) =>
		lifecycleOwnerPattern.test(command)
	);
	const hasBrowserVerification = verificationCommands.some((command) =>
		browserVerificationPattern.test(command)
	);
	const hasUnavailableEvidence = events.some((event) => {
		const text = eventTextForClassification(event);
		return text !== undefined && serverUnavailablePattern.test(text);
	});
	if (!hasLifecycleOwner || (!hasBrowserVerification && !hasUnavailableEvidence)) {
		return undefined;
	}
	return {
		commands: uniqueOrdered(verificationCommands),
		controlledLifecycle: true,
		failurePhase: 'verification',
		reason: 'server_lifecycle_conflict',
	};
}

export function detectActiveVerificationTimeout(
	commands: string[],
	events: AgentEvent[],
	exitCode: number
): ActiveVerificationTimeout | undefined {
	if (exitCode !== orchestratorExitCodes.idleTimeout) return undefined;
	const verificationCommands = commands.filter((command) =>
		lifecycleCommandPattern.test(command)
	);
	if (verificationCommands.length > 0) {
		const uniqueCommands = uniqueOrdered(verificationCommands);
		return {
			broadCommands: broadLifecycleCommands(uniqueCommands),
			commands: uniqueCommands,
			failurePhase: 'verification',
			lastProgress: uniqueCommands.join(' | '),
			reason: 'silent_during_active_verification',
			targetedEvidence: targetedVerificationEvidence(events),
		};
	}
	const assistantProgress = events
		.filter((event): event is Extract<AgentEvent, { type: 'assistant_text' }> => {
			return event.type === 'assistant_text';
		})
		.map((event) => event.chunk.trim())
		.filter(Boolean);
	const lastProgress = assistantProgress.at(-1);
	if (!lastProgress) return undefined;
	if (completedResultPattern.test(lastProgress)) return undefined;
	if (!activeVerificationTextPattern.test(lastProgress)) return undefined;
	const commandsFromProgress = extractInlineCommands(lastProgress);
	return {
		broadCommands: broadLifecycleCommands(commandsFromProgress),
		commands: commandsFromProgress,
		failurePhase: 'verification',
		lastProgress: lastProgress.replace(/\s+/g, ' ').slice(0, 500),
		reason: 'silent_during_active_verification',
		targetedEvidence: targetedVerificationEvidence(events),
	};
}

function broadLifecycleCommands(commands: string[]): string[] {
	return commands.filter((command) => broadLifecycleSmokePattern.test(command));
}

function targetedVerificationEvidence(events: AgentEvent[]): string[] {
	return uniqueOrdered(
		events.flatMap((event) => {
			const text = eventTextForClassification(event);
			if (text === undefined || !targetedVerificationPassedPattern.test(text)) return [];
			return [text.replace(/\s+/g, ' ').slice(0, 500)];
		})
	);
}

export function activeVerificationRecoveryFor(
	timeout: ActiveVerificationTimeout | undefined
): ActiveVerificationRecovery | undefined {
	if (timeout === undefined) return undefined;
	const [timedOutCommand] = timeout.broadCommands;
	if (timedOutCommand === undefined || timeout.targetedEvidence.length === 0) {
		return undefined;
	}
	return {
		commands: timeout.commands,
		decision: 'waiting_approval',
		failurePhase: 'verification',
		reason: 'targeted_verification_passed_broad_gate_timed_out',
		targetedEvidence: timeout.targetedEvidence,
		timedOutCommand,
	};
}

function extractInlineCommands(text: string): string[] {
	const commands: string[] = [];
	for (const match of text.matchAll(inlineCommandPattern)) {
		const command = match[1]?.trim();
		if (command) commands.push(command);
	}
	return uniqueOrdered(commands);
}

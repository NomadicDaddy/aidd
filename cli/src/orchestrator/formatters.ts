import type { FeatureValidationResult } from 'aidd-shared/metadata/features';
import type { ArtifactCheckResult, ArtifactStatus } from 'aidd-shared/metadata/store';
import type { SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { aiddExecutionModes } from 'aidd-shared/execution-mode';
import {
	describeOrchestratorExitCode,
	orchestratorExitCodes,
} from 'aidd-shared/orchestrator/result';

import type { extractIterationDetails } from './details.ts';

export function formatSelectedWork(work: SelectedWork): string {
	const kind = work.kind ?? 'generic';
	return `${kind}:${work.id}${work.description ? ` - ${work.description}` : ''}`;
}

export function formatBackendStarted(backend: string, pid: number | undefined): string {
	const pidText = pid === undefined ? '' : ` pid=${pid}`;
	return `[backend] ${backend} started${pidText}\n`;
}

export function formatThinkingLine(backend: string): string {
	return `[thinking] waiting for ${backend} output...\n`;
}

export function formatIdleWarningLine(afterMs: number): string {
	return `[thinking] still waiting after ${formatDuration(afterMs)}; logged idle warning (telemetry only).\n`;
}

export function formatDuration(ms: number): string {
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

export function formatEncodingViolationSummary(
	violations: { path: string; reason: string }[]
): string {
	const lines = [
		'Prompt artifact encoding check failed. Convert these files to UTF-8 before running a backend:',
	];
	for (const violation of violations) {
		lines.push(`  - ${violation.path}: ${violation.reason}`);
	}
	return lines.join('\n');
}

export function formatStopRequestedSummary(summary: string, exitCode: number): string {
	if (exitCode === orchestratorExitCodes.success) return summary;
	return `${summary}; stop requested after current iteration; backend exit code ${exitCode}`;
}

export function formatFailureSummary(
	summary: string,
	exitCode: number,
	details: ReturnType<typeof extractIterationDetails>,
	backendExitCode: number = exitCode
): string {
	if (details.outcome.status === 'active_verification_timeout') {
		const commands = details.outcome.activeVerificationTimeout?.commands ?? [];
		const commandText = commands.length > 0 ? `: ${commands.join(' | ')}` : '';
		return `${summary}; active_verification_timeout${commandText}; backend exit code ${backendExitCode}`;
	}
	if (details.outcome.status === 'verification_lifecycle_conflict') {
		const commands = details.outcome.verificationLifecycleConflict?.commands ?? [];
		const commandText = commands.length > 0 ? `: ${commands.join(' | ')}` : '';
		return `${summary}; verification_lifecycle_conflict${commandText}; backend exit code ${backendExitCode}`;
	}
	if (details.providerError) {
		const requestId = details.providerError.requestId
			? ` requestId=${details.providerError.requestId}`
			: '';
		return `${summary}; provider error${requestId}: ${details.providerError.message}`;
	}
	// Lead with the classified reason; keep the raw backend number bracketed for grep-ability.
	// exitCode is the orchestrator's classification and backendExitCode the raw process exit —
	// they diverge when classification reinterprets a clean exit (e.g. exit 0 with no
	// AIDD_RESULT records as 73), and a summary that only echoed the raw 0 read as success.
	const label = describeOrchestratorExitCode(exitCode);
	if (label !== undefined) return `${summary}; ${label} [backend exit ${backendExitCode}]`;
	return `${summary}; backend exit code ${backendExitCode}`;
}

export function formatRecoverySummary(
	summary: string,
	details: ReturnType<typeof extractIterationDetails>
): string {
	const recovery = details.outcome.activeVerificationRecovery;
	if (!recovery) return summary;
	return `${summary}; active_verification_recovery: ${recovery.timedOutCommand}; targeted verification passed; status set to waiting_approval`;
}

export function formatToolArgs(args: unknown): string {
	if (args === undefined || args === null) return '';
	if (typeof args === 'string') {
		const trimmed = args.length > 80 ? `${args.slice(0, 80)}…` : args;
		return ` ${trimmed}`;
	}
	if (typeof args !== 'object') return ` ${String(args)}`;
	const record = args as Record<string, unknown>;
	let summary: string | undefined;
	for (const key of ['command', 'file_path', 'path', 'pattern', 'description']) {
		const value = record[key];
		if (typeof value === 'string') {
			summary = value;
			break;
		}
	}
	if (!summary) return '';
	const trimmed = summary.length > 80 ? `${summary.slice(0, 80)}…` : summary;
	return ` ${trimmed}`;
}

export function isAgentSignalEvent(type: string): boolean {
	return (
		type === 'assistant_delta' ||
		type === 'assistant_text' ||
		type === 'tool_call' ||
		type === 'tool_result' ||
		type === 'usage'
	);
}

export function formatFeatureValidation(
	projectDir: string,
	result: FeatureValidationResult
): string {
	const projectName = projectDir.split(/[/]/).filter(Boolean).pop() ?? projectDir;
	const total = result.total;
	const invalid = new Set(result.issues.map((issue) => issue.id)).size;
	const valid = total - invalid;
	const lines: string[] = [];
	lines.push('');
	lines.push('==============================================================================');
	lines.push(`Feature JSON Validation: ${projectName}`);
	lines.push('==============================================================================');
	lines.push('');
	lines.push(`Total files:         ${total}`);
	lines.push(`Valid:               ${valid}`);
	lines.push(`Invalid:             ${invalid}`);
	lines.push('');
	if (result.valid) {
		lines.push('All feature.json files are valid.');
	} else {
		lines.push('Issues:');
		for (const issue of result.issues) lines.push(`  - ${issue.id}: ${issue.message}`);
	}
	if (result.warnings && result.warnings.length > 0) {
		lines.push('');
		lines.push('Warnings:');
		for (const warning of result.warnings) lines.push(`  - ${warning.id}: ${warning.message}`);
	}
	lines.push('');
	lines.push('==============================================================================');
	return lines.join('\n');
}

export function formatArtifactCheck(projectDir: string, result: ArtifactCheckResult): string {
	const projectName = projectDir.split(/[/]/).filter(Boolean).pop() ?? projectDir;
	const lines: string[] = [];
	lines.push('');
	lines.push('==============================================================================');
	lines.push(`Project-Level Assertions Check: ${projectName}`);
	lines.push(`  Checked at:        ${result.checkedAt}`);
	lines.push(`  Stale threshold:   ${result.staleThresholdDays} days`);
	lines.push('==============================================================================');
	lines.push('');
	const header = `  ${pad('ARTIFACT', 22)} ${pad('SEVERITY', 12)} ${pad('STATUS', 8)} ${pad('MTIME (UTC)', 22)} ${pad('AGE', 5)}`;
	const rule = `  ${'-'.repeat(22)} ${'-'.repeat(12)} ${'-'.repeat(8)} ${'-'.repeat(22)} ${'-'.repeat(5)}`;
	lines.push(header);
	lines.push(rule);
	for (const artifact of result.artifacts) lines.push(formatArtifactRow(artifact));
	lines.push('');
	const { summary } = result;
	lines.push(
		`  Summary: ${summary.present}/${summary.total} present — ${summary.fresh} fresh, ${summary.stale} stale, ${summary.missing} missing`
	);
	if (result.preOnboarding && summary.requiredMissing > 0) {
		lines.push(
			`  Note: ${summary.requiredMissing} required artifact(s) missing, but the project is pre-onboarding`
		);
		lines.push(
			`        (phase: ${result.phase}) — reported as informational, not a failure. Onboarding`
		);
		lines.push(
			'        creates these; the check will enforce them once the project reaches coding.'
		);
	}
	lines.push('==============================================================================');
	return lines.join('\n');
}

function formatArtifactRow(artifact: ArtifactStatus): string {
	const status = artifact.exists
		? artifact.freshness === 'stale'
			? 'STALE'
			: 'FRESH'
		: 'MISSING';
	const mtime = artifact.mtime ?? '-';
	const age = artifact.ageDays === null ? '-' : `${artifact.ageDays}d`;
	return `  ${pad(artifact.label, 22)} ${pad(artifact.severity, 12)} ${pad(status, 8)} ${pad(mtime, 22)} ${pad(age, 5)}`;
}

function pad(value: string, width: number): string {
	return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

export function writeIterationStart(input: {
	iteration: number;
	plan: RunPlan;
	promptChars: number;
	work: SelectedWork;
}): void {
	const lines = [
		'',
		'==============================================================================',
		`aidd iteration ${input.iteration + 1} starting`,
		'==============================================================================',
		`Mode:       ${input.plan.mode}`,
		`Execution:  ${input.plan.triumvirate ? aiddExecutionModes.triumvirate : aiddExecutionModes.singleAgent}`,
		`Backend:    ${input.plan.backend}`,
		`Project:    ${input.plan.projectDir}`,
		`Work:       ${formatSelectedWork(input.work)}`,
		`Prompt:     ${input.promptChars} chars`,
		'------------------------------------------------------------------------------',
	];
	process.stdout.write(`${lines.join('\n')}\n`);
}

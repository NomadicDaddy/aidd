import type { ResolvedConfig } from 'aidd-shared/config';
import type { RunPlan } from 'aidd-shared/plan/types';

import {
	completeDirectAiText,
	DirectAiConfigError,
	DirectAiTimeoutError,
	isDirectAiSurfaceEnabled,
	resolveDirectAiCall,
} from 'aidd-shared/agent/directAi';
import { scrubSecrets } from 'aidd-shared/lib/secretScrubber';
import { type StopReason, orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { runRepoDir } from 'aidd-shared/plan/types';
import { decodeExitCode } from 'aidd-shared/runs/outcome';

import type { GitCommitSummary, RunAccumulator } from './types.ts';

import { gitCommitsDiffStat } from './git.ts';

export interface RunAiSummaryInput {
	acc: RunAccumulator;
	exitCode: number;
	plan: RunPlan;
	stopReason: StopReason;
	summary: string;
}

export type RunAiSummarizer = (input: RunAiSummaryInput) => Promise<null | string>;

const MAX_AI_SUMMARY_LENGTH = 400;
const MAX_TIMEOUT_SECONDS = 30;

/**
 * Produces a human-readable explanation of why a run ended abnormally, or null
 * when the run completed normally. Used so the AI summary prompt can instruct
 * the model to explain the termination reason (e.g. timeout, provider error)
 * rather than only describing what was accomplished.
 */
export function explainAbnormalTermination(
	exitCode: number,
	stopReason: StopReason
): null | string {
	if (exitCode === orchestratorExitCodes.success) return null;

	const decoded = decodeExitCode(exitCode);
	if (decoded) {
		return `${decoded.label}: ${decoded.title}`;
	}

	// Fall back to the stop reason for unmapped exit codes.
	return `Run ended abnormally (stop reason: ${stopReason}, exit code: ${exitCode}).`;
}

async function buildSummaryPrompt(input: RunAiSummaryInput): Promise<string> {
	const { acc, exitCode, plan, stopReason, summary } = input;
	const durationMs = Date.now() - acc.runStartedAtMs;
	const selectedFeatures = [...acc.selectedFeatures];
	const completedFeatures = [...acc.completedFeatures];
	const commits = acc.commitsCreated;
	const totals = acc.runTotals;

	const parts: string[] = [
		`Mode: ${plan.mode}`,
		`Backend: ${plan.backend}`,
		`Stop reason: ${stopReason}`,
		`Exit code: ${exitCode}`,
		`Duration: ${durationMs}ms`,
		`Model: ${plan.model ?? 'unknown'}`,
	];
	if (selectedFeatures.length > 0) {
		parts.push(`Selected features: ${selectedFeatures.join(', ')}`);
	}
	if (completedFeatures.length > 0) {
		parts.push(`Completed features: ${completedFeatures.join(', ')}`);
	}
	if (commits.length > 0) {
		const commitSummaries = commits
			.map((c: GitCommitSummary) => `${c.hash.slice(0, 7)} ${c.subject}`)
			.join('; ');
		parts.push(`Commits: ${commitSummaries}`);
		// Ground-truth scope: counts what actually landed in git, including files mutated
		// through bash (git mv/rm, scripted rewrites) that the Edit/Write tool counts miss.
		const diffStat = await gitCommitsDiffStat(
			runRepoDir(plan),
			commits.map((c: GitCommitSummary) => c.hash)
		);
		if (diffStat.filesChanged > 0) {
			parts.push(
				`Committed changes (git diffstat, source of truth for scope): ${diffStat.filesChanged} files changed, ${diffStat.insertions} insertions(+), ${diffStat.deletions} deletions(-)`
			);
		}
	}
	parts.push(
		`Iterations: ${totals.iterations}`,
		`Tool calls: ${totals.toolCalls}`,
		`Tokens: ${totals.inputTokens} in / ${totals.outputTokens} out`,
		`Cost: $${totals.costUsd.toFixed(4)}`,
		`Errors: ${totals.errors}`,
		`Rate limits: ${totals.rateLimits}`,
		// These count only Write/Edit tool calls and undercount bash-driven file changes;
		// prefer the committed diffstat above when describing how much the run changed.
		`Files edited via Edit tool: ${totals.filesEdited}`,
		`Files created via Write tool: ${totals.filesCreated}`
	);
	if (acc.scopeOverrun) {
		parts.push('Scope overrun: true');
	}
	parts.push(`Mechanical summary: ${summary}`);

	const abnormalExplanation = explainAbnormalTermination(exitCode, stopReason);
	const instruction = abnormalExplanation
		? `Summarize this coding-agent run in 1-2 concise sentences. Describe what was accomplished, and explain why the run ended abnormally: ${abnormalExplanation}`
		: 'Summarize this coding-agent run in 1-2 concise sentences. Focus on what was accomplished.';

	return [instruction, '', 'Run data:', ...parts].join('\n');
}

/**
 * Create an AI run summarizer that generates a brief (1-2 sentence) summary
 * of a completed coding-agent run using the Direct AI provider.
 *
 * Returns `undefined` when the `runSummaries` Direct AI surface is not enabled,
 * so callers can skip the summarization call entirely.
 */
export function createRunAiSummarizer(
	config: ResolvedConfig,
	rootDir: string
): RunAiSummarizer | undefined {
	if (!isDirectAiSurfaceEnabled(config.directAi, 'runSummaries')) {
		return undefined;
	}

	const effectiveTimeout = Math.min(
		config.directAi?.timeoutSeconds ?? MAX_TIMEOUT_SECONDS,
		MAX_TIMEOUT_SECONDS
	);

	return async (input: RunAiSummaryInput): Promise<null | string> => {
		try {
			const resolution = resolveDirectAiCall(config, {
				surface: 'runSummaries',
				timeoutSeconds: effectiveTimeout,
			});
			const prompt = scrubSecrets(await buildSummaryPrompt(input));
			const raw = await completeDirectAiText(resolution, {
				cwd: rootDir,
				prompt,
			});
			const scrubbed = scrubSecrets(raw);
			const trimmed = scrubbed.trim();
			if (trimmed.length === 0) return null;
			return trimmed.length > MAX_AI_SUMMARY_LENGTH
				? trimmed.slice(0, MAX_AI_SUMMARY_LENGTH)
				: trimmed;
		} catch (err) {
			// Fail-soft: any error resolves to null, never throws.
			// Log a single warning without a stack trace.
			const message =
				err instanceof DirectAiConfigError || err instanceof DirectAiTimeoutError
					? err.message
					: err instanceof Error
						? err.message
						: String(err);
			console.warn(`[ai-summary] Failed to generate run summary: ${message}`);
			return null;
		}
	};
}

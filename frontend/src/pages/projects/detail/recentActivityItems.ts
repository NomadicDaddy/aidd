import { aiddExecutionModes } from 'aidd-shared/execution-mode';

import type { GitCommitRef, ProjectLocalIteration, ProjectLocalRun } from '../../../api/types.ts';
import type { ExecutionIdentity } from '../../../lib/executionIdentity.ts';

import { formatDuration } from '../../../lib/formatters.ts';

export interface RecentMetadataActivityItem {
	commits: GitCommitRef[];
	detailParts: string[];
	executionIdentity: ExecutionIdentity | null;
	id: string;
	status: string;
	statusLabel: string;
	timestamp: string;
	timeValue: number;
	title: string;
	traceLabel: string;
}

function timestampValue(value: null | string): number {
	if (!value) return 0;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? 0 : parsed;
}

function latestTimestamp(startedAt: null | string, endedAt: null | string): null | string {
	const started = timestampValue(startedAt);
	const ended = timestampValue(endedAt);
	const latest = Math.max(started, ended);
	return latest > 0 ? new Date(latest).toISOString() : null;
}

function sentenceCase(value: string): string {
	const normalized = value.replaceAll(/[-_]+/g, ' ').trim();
	if (!normalized) return 'aidd';
	return `${normalized[0]?.toUpperCase() ?? ''}${normalized.slice(1)}`;
}

function runStatus(run: ProjectLocalRun): string {
	if (run.stopReason === 'completed') return 'completed';
	if (run.stopReason) return run.stopReason;
	if (run.exitCode === 0) return 'completed';
	if (typeof run.exitCode === 'number') return 'failed';
	return 'unknown';
}

/**
 * The badge label for a run status.
 *
 * The raw value is an enum and two of them are snake_case, so the timeline printed `no_work`
 * against neighbours reading `completed` and `feature completed`. The badges around it are
 * lowercase words, so this is a word-split rather than a sentence-case: `no work`,
 * `stop_requested` to `stop requested`.
 */
export function runStatusLabel(status: string): string {
	return status.replaceAll(/[-_]+/gu, ' ').trim() || status;
}

function statusVerb(status: string): string {
	if (status === 'success') return 'succeeded';
	if (status === 'completed') return 'completed';
	if (status === 'running') return 'is running';
	if (status === 'failed' || status === 'error') return 'failed';
	if (status === 'killed') return 'was killed';
	if (status === 'stopped' || status === 'stop_requested') return 'was stopped';
	return sentenceCase(status);
}

function modeLabel(mode: null | string, fallback: string): string {
	return sentenceCase(mode ?? fallback);
}

function runModeLabel(run: ProjectLocalRun): string {
	const mode = run.phase && run.phase !== 'coding' ? run.phase : run.mode;
	if (run.executionMode === aiddExecutionModes.triumvirate) {
		return `Tri-mode ${modeLabel(mode, 'run').toLowerCase()}`;
	}
	return modeLabel(mode, 'run');
}

function sourceLabel(source: null | string): null | string {
	if (!source) return null;
	if (source === 'cli') return 'CLI launch';
	if (source === 'director') return 'Director launch';
	if (source === 'web') return 'Web launch';
	return `${sentenceCase(source)} launch`;
}

function executionIdentity({
	backend,
	model,
	provider,
	reasoningEffort,
}: {
	backend: null | string;
	model?: null | string;
	provider?: null | string;
	reasoningEffort?: null | string;
}): ExecutionIdentity | null {
	if (!backend && !provider && !model && !reasoningEffort) return null;
	return { backend, model, provider, reasoningEffort };
}

function countPart(count: number, singular: string, plural: string): null | string {
	if (count <= 0) return null;
	return `${count} ${count === 1 ? singular : plural}`;
}

function runWorkSummary(run: ProjectLocalRun): null | string {
	if (run.aiSummary) return run.aiSummary;
	const parts = [
		countPart(run.filesEdited, 'file edited', 'files edited'),
		countPart(run.filesCreated, 'file created', 'files created'),
		countPart(run.commitsCreatedCount, 'commit', 'commits'),
		countPart(run.completedFeatures.length, 'feature completed', 'features completed'),
	].filter((part): part is string => part !== null);
	if (parts.length > 0) return parts.join(', ');
	if (run.summary) return run.summary;
	return null;
}

/**
 * Eight characters of a run id, the same length `shortHash` cuts a commit SHA to.
 *
 * The split on `_` drops a launcher prefix where one exists. What it did not do was shorten
 * anything else: an id that is a bare UUID came through all 36 characters, so the timeline's trace
 * line ended in `Run 23241b43-9a00-40c1-896f-da8662e8a7fe` beside an eight-character commit chip.
 */
function shortRunId(runId: null | string): string {
	if (!runId) return 'run';
	return (runId.split('_').at(-1) ?? runId).slice(0, 8);
}

function activityFromRun(run: ProjectLocalRun, index: number): null | RecentMetadataActivityItem {
	const timestamp = latestTimestamp(run.startedAt, run.endedAt);
	if (!timestamp) return null;
	const status = runStatus(run);
	const duration = run.durationMs ? formatDuration(run.durationMs) : null;
	return {
		commits: run.commitsCreated,
		detailParts: [sourceLabel(run.source), duration, runWorkSummary(run)].filter(
			(part): part is string => part !== null,
		),
		executionIdentity: executionIdentity(run),
		id: `run:${run.runId ?? index + 1}`,
		status,
		statusLabel: runStatusLabel(status),
		timestamp,
		timeValue: Date.parse(timestamp),
		title: `${runModeLabel(run)} run ${statusVerb(status)}`,
		traceLabel: `Run ${shortRunId(run.runId)}`,
	};
}

function iterationTitle(iteration: ProjectLocalIteration): string {
	const label = modeLabel(iteration.backend, 'iteration');
	const prefix =
		iteration.executionMode === aiddExecutionModes.triumvirate
			? `Tri-mode ${label.toLowerCase()}`
			: label;
	return `${prefix} iteration ${statusVerb(iteration.status)}`;
}

function iterationWorkSummary(iteration: ProjectLocalIteration): null | string {
	const featureCount = new Set([...iteration.selectedFeatures, ...iteration.completedFeatures])
		.size;
	const parts = [
		countPart(featureCount, 'feature touched', 'features touched'),
		iteration.finalChecks?.smokeQc === 'passed' ? 'smoke:qc passed' : null,
		iteration.finalChecks?.typecheck === 'passed' ? 'typecheck passed' : null,
		iteration.finalChecks?.build === 'passed' ? 'build passed' : null,
		iteration.finalChecks?.format === 'passed' ? 'format passed' : null,
	].filter((part): part is string => part !== null);
	if (parts.length > 0) return parts.join(', ');
	return iteration.summary;
}

function activityFromIteration(
	iteration: ProjectLocalIteration,
	index: number,
): null | RecentMetadataActivityItem {
	const timestamp = latestTimestamp(iteration.startedAt, iteration.endedAt);
	if (!timestamp) return null;
	const duration = iteration.durationMs ? formatDuration(iteration.durationMs) : null;
	return {
		commits: [],
		detailParts: [duration, iterationWorkSummary(iteration)].filter(
			(part): part is string => part !== null,
		),
		executionIdentity: executionIdentity(iteration),
		id: `iteration:${iteration.runId ?? iteration.iteration ?? index + 1}`,
		status: iteration.status,
		statusLabel: runStatusLabel(iteration.status),
		timestamp,
		timeValue: Date.parse(timestamp),
		title: iterationTitle(iteration),
		traceLabel: iteration.runId
			? `Run ${shortRunId(iteration.runId)}`
			: `Iteration ${iteration.iteration ?? index + 1}`,
	};
}

export function recentMetadataActivity(
	localRuns: ProjectLocalRun[],
	localIterations: ProjectLocalIteration[],
): RecentMetadataActivityItem[] {
	const representedRunIds = new Set(
		localRuns
			.map((run) => run.runId)
			.filter((runId): runId is string => runId !== null && runId.length > 0),
	);
	return [
		...localRuns.map((run, index) => activityFromRun(run, index)),
		...localIterations
			.filter((iteration) => !iteration.runId || !representedRunIds.has(iteration.runId))
			.map((iteration, index) => activityFromIteration(iteration, index)),
	]
		.filter((item): item is RecentMetadataActivityItem => item !== null)
		.sort((left, right) => right.timeValue - left.timeValue);
}

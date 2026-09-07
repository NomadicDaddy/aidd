import type {
	ActivityEntry,
	ActivityExecutionIdentity,
	ActivityIterationInput,
	ActivityRunInput,
} from './activityTypes.ts';

import { aiddExecutionModes } from '../execution-mode.ts';
import { type ExecutionStatus, executionStatusPresentation } from './outcome.ts';

export type {
	ActivityEntry,
	ActivityExecutionIdentity,
	ActivityIterationInput,
	ActivityRunInput,
} from './activityTypes.ts';

/**
 * How a run or iteration recorded in a project's local `.aidd` metadata reads as one timeline
 * entry.
 *
 * This lives in `aidd-shared` rather than beside the project-detail timeline that first needed it
 * because two surfaces now render the same activity: the project page derives it in the browser
 * from the full metadata, and the Dashboard's bounded read model derives it on the server from the
 * same inputs. Ordering, the run-status derivation, the status labels and the execution identity
 * are semantics, not presentation, so a second implementation would let the two surfaces disagree
 * about what the same run did.
 *
 * What stays out is formatting: an entry carries `durationMs`, not a rendered duration, so each
 * surface keeps its own formatter. The input shapes are structural, so the frontend's
 * `ProjectLocalRun`/`ProjectLocalIteration` and the backend's `…Dto` counterparts both satisfy
 * them without either side importing the other's types.
 */

function timestampValue(value: null | string): number {
	if (!value) return 0;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? 0 : parsed;
}

function latestTimestamp(startedAt: null | string, endedAt: null | string): null | string {
	const latest = Math.max(timestampValue(startedAt), timestampValue(endedAt));
	return latest > 0 ? new Date(latest).toISOString() : null;
}

function sentenceCase(value: string): string {
	const normalized = value.replaceAll(/[-_]+/gu, ' ').trim();
	if (!normalized) return 'aidd';
	return `${normalized[0]?.toUpperCase() ?? ''}${normalized.slice(1)}`;
}

function runStatus(run: ActivityRunInput): string {
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
	if (status === 'success') return executionStatusPresentation.completed.label.toLowerCase();
	if (Object.hasOwn(executionStatusPresentation, status)) {
		return executionStatusPresentation[status as ExecutionStatus].label.toLowerCase();
	}
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

function runModeLabel(run: ActivityRunInput): string {
	const mode = run.phase && run.phase !== 'coding' ? run.phase : run.mode;
	if (run.executionMode === aiddExecutionModes.triumvirate) {
		return `Tri-mode ${modeLabel(mode, 'run').toLowerCase()}`;
	}
	return modeLabel(mode, 'run');
}

/** How a launch source reads in a timeline row. Exported so a surface can label a source alone. */
export function activitySourceLabel(source: null | string): null | string {
	if (!source) return null;
	if (source === 'cli') return 'CLI launch';
	if (source === 'director') return 'Director launch';
	if (source === 'web') return 'Web launch';
	return `${sentenceCase(source)} launch`;
}

function executionIdentity(entry: {
	backend: null | string;
	model?: null | string;
	provider?: null | string;
	reasoningEffort?: null | string;
}): ActivityExecutionIdentity | null {
	const { backend, model = null, provider = null, reasoningEffort = null } = entry;
	if (!backend && !provider && !model && !reasoningEffort) return null;
	return { backend, model, provider, reasoningEffort };
}

function countPart(count: number, singular: string, plural: string): null | string {
	if (count <= 0) return null;
	return `${count} ${count === 1 ? singular : plural}`;
}

function runWorkSummary(run: ActivityRunInput): null | string {
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

function entryFromRun(run: ActivityRunInput, index: number): ActivityEntry | null {
	const timestamp = latestTimestamp(run.startedAt, run.endedAt);
	if (!timestamp) return null;
	const status = runStatus(run);
	return {
		commits: run.commitsCreated,
		durationMs: run.durationMs,
		executionIdentity: executionIdentity(run),
		id: `run:${run.runId ?? index + 1}`,
		runId: run.runId,
		sourceLabel: activitySourceLabel(run.source),
		status,
		statusLabel: runStatusLabel(status),
		summary: runWorkSummary(run),
		timestamp,
		timeValue: Date.parse(timestamp),
		title: `${runModeLabel(run)} run ${statusVerb(status)}`,
		traceLabel: `Run ${shortRunId(run.runId)}`,
	};
}

function iterationTitle(iteration: ActivityIterationInput): string {
	const label = modeLabel(iteration.backend, 'iteration');
	const prefix =
		iteration.executionMode === aiddExecutionModes.triumvirate
			? `Tri-mode ${label.toLowerCase()}`
			: label;
	return `${prefix} iteration ${statusVerb(iteration.status)}`;
}

function iterationWorkSummary(iteration: ActivityIterationInput): null | string {
	const featureCount = new Set([...iteration.selectedFeatures, ...iteration.completedFeatures])
		.size;
	const checks = iteration.finalChecks;
	const parts = [
		countPart(featureCount, 'feature touched', 'features touched'),
		checks?.smokeQc === 'passed' ? 'smoke:qc passed' : null,
		checks?.typecheck === 'passed' ? 'typecheck passed' : null,
		checks?.build === 'passed' ? 'build passed' : null,
		checks?.format === 'passed' ? 'format passed' : null,
	].filter((part): part is string => part !== null);
	if (parts.length > 0) return parts.join(', ');
	return iteration.summary;
}

function entryFromIteration(
	iteration: ActivityIterationInput,
	index: number,
): ActivityEntry | null {
	const timestamp = latestTimestamp(iteration.startedAt, iteration.endedAt);
	if (!timestamp) return null;
	return {
		commits: [],
		durationMs: iteration.durationMs,
		executionIdentity: executionIdentity(iteration),
		id: `iteration:${iteration.runId ?? iteration.iteration ?? index + 1}`,
		runId: iteration.runId,
		sourceLabel: null,
		status: iteration.status,
		statusLabel: runStatusLabel(iteration.status),
		summary: iterationWorkSummary(iteration),
		timestamp,
		timeValue: Date.parse(timestamp),
		title: iterationTitle(iteration),
		traceLabel: iteration.runId
			? `Run ${shortRunId(iteration.runId)}`
			: `Iteration ${iteration.iteration ?? index + 1}`,
	};
}

/**
 * Every run and iteration as one list, newest first.
 *
 * An iteration whose `runId` is already represented by a run entry is dropped: the two records
 * describe the same work from either side of the orchestrator, and the run entry carries the
 * commits. Entries with no usable timestamp cannot be placed on a timeline and are dropped too.
 */
export function recentActivityEntries(
	runs: ActivityRunInput[],
	iterations: ActivityIterationInput[],
): ActivityEntry[] {
	const representedRunIds = new Set(
		runs.map((run) => run.runId).filter((runId): runId is string => Boolean(runId)),
	);
	return [
		...runs.map((run, index) => entryFromRun(run, index)),
		...iterations
			.filter((iteration) => !iteration.runId || !representedRunIds.has(iteration.runId))
			.map((iteration, index) => entryFromIteration(iteration, index)),
	]
		.filter((entry): entry is ActivityEntry => entry !== null)
		.sort((left, right) => right.timeValue - left.timeValue);
}

import type {
	ProjectLocalIterationDto,
	ProjectLocalRunDto,
	ProjectSyncStateDto,
} from '../../types.ts';

interface LatestRun {
	backend: null | string;
	endedAt: null | string;
	errorMessage: null | string;
	exitCode: null | number;
	model: null | string;
	provider: null | string;
	reasoningEffort: null | string;
	sortTime: number;
	startedAt: null | string;
	status: string;
}

function emptySyncState(): ProjectSyncStateDto {
	return {
		lastSyncAt: null,
		lastSyncError: null,
		preferredCli: null,
		preferredModel: null,
		preferredProvider: null,
		preferredReasoningEffort: null,
		syncState: 'unknown',
	};
}

function timestampValue(value: null | string): number {
	if (!value) return 0;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeTimestamp(value: null | string): null | string {
	const parsed = timestampValue(value);
	return parsed > 0 ? new Date(parsed).toISOString() : null;
}

function activitySortTime(startedAt: null | string, endedAt: null | string): number {
	return Math.max(timestampValue(startedAt), timestampValue(endedAt));
}

function statusFromLocalRun(run: ProjectLocalRunDto): string {
	if (run.stopReason) return run.stopReason;
	if (run.exitCode === 0) return 'completed';
	if (typeof run.exitCode === 'number') return 'failed';
	return 'unknown';
}

function errorMessageForStatus(
	status: string,
	exitCode: null | number,
	summary: null | string
): null | string {
	const normalized = status.toLowerCase();
	if (
		summary &&
		[
			'blocked',
			'blocked_dirty_worktree',
			'blocked_needs_user_input',
			'error',
			'exit_error',
			'failed',
			'failure',
			'killed',
			'partial_success_blocked',
		].includes(normalized)
	) {
		return summary;
	}
	if (typeof exitCode === 'number' && exitCode !== 0) {
		return `aidd metadata reports exit code ${exitCode}`;
	}
	if (
		[
			'blocked',
			'blocked_dirty_worktree',
			'blocked_needs_user_input',
			'exit_error',
			'partial_success_blocked',
		].includes(normalized)
	) {
		return `aidd metadata reports ${status}`;
	}
	if (['error', 'failed', 'failure', 'killed'].includes(normalized)) {
		return `aidd metadata reports status ${status}`;
	}
	return null;
}

function localRunActivity(run: ProjectLocalRunDto): LatestRun {
	const status = statusFromLocalRun(run);
	return {
		backend: run.backend,
		endedAt: run.endedAt,
		errorMessage: errorMessageForStatus(status, run.exitCode, run.summary),
		exitCode: run.exitCode,
		model: run.model,
		provider: run.provider,
		reasoningEffort: run.reasoningEffort,
		sortTime: activitySortTime(run.startedAt, run.endedAt),
		startedAt: run.startedAt,
		status,
	};
}

function localIterationActivity(iteration: ProjectLocalIterationDto): LatestRun {
	return {
		backend: iteration.backend,
		endedAt: iteration.endedAt,
		errorMessage: errorMessageForStatus(
			iteration.status,
			iteration.exitCode,
			iteration.summary
		),
		exitCode: iteration.exitCode,
		model: null,
		provider: null,
		reasoningEffort: null,
		sortTime: activitySortTime(iteration.startedAt, iteration.endedAt),
		startedAt: iteration.startedAt,
		status: iteration.status,
	};
}

function latestFileBackedActivity(
	localRuns: ProjectLocalRunDto[],
	localIterations: ProjectLocalIterationDto[]
): LatestRun | undefined {
	const activities = [
		...localRuns.map((run) => localRunActivity(run)),
		...localIterations.map((iteration) => localIterationActivity(iteration)),
	].filter((activity) => activity.sortTime > 0);
	return activities.sort((left, right) => right.sortTime - left.sortTime)[0];
}

function syncStateFromLatestRun(latestRun: LatestRun | undefined): ProjectSyncStateDto {
	if (!latestRun) return emptySyncState();

	let syncState: ProjectSyncStateDto['syncState'];
	const normalizedStatus = latestRun.status.toLowerCase();
	switch (normalizedStatus) {
		case 'blocked':
		case 'blocked_dirty_worktree':
		case 'blocked_needs_user_input':
		case 'error':
		case 'exit_error':
		case 'failed':
		case 'failure':
		case 'killed':
		case 'partial_success_blocked':
			syncState = 'error';
			break;
		case 'completed':
		case 'max_iterations':
		case 'no_work':
		case 'stop_requested':
		case 'stopped':
		case 'success':
			syncState = 'idle';
			break;
		case 'running':
			syncState = 'syncing';
			break;
		default:
			if (typeof latestRun.exitCode === 'number') {
				syncState = latestRun.exitCode === 0 ? 'idle' : 'error';
			} else {
				syncState = 'unknown';
			}
	}

	const lastSyncAt =
		normalizeTimestamp(latestRun.endedAt) ?? normalizeTimestamp(latestRun.startedAt);

	let lastSyncError: null | string = null;
	if (latestRun.errorMessage) {
		lastSyncError = latestRun.errorMessage;
	} else if (syncState === 'error') {
		lastSyncError = `aidd metadata reports status ${latestRun.status}`;
	}

	return {
		lastSyncAt,
		lastSyncError,
		preferredCli: latestRun.backend ?? null,
		preferredModel: latestRun.model ?? null,
		preferredProvider: latestRun.provider ?? null,
		preferredReasoningEffort: latestRun.reasoningEffort ?? null,
		syncState,
	};
}

export function syncStateFromLocalData(
	localRuns: ProjectLocalRunDto[],
	localIterations: ProjectLocalIterationDto[]
): ProjectSyncStateDto {
	return syncStateFromLatestRun(latestFileBackedActivity(localRuns, localIterations));
}

import { describe, expect, test } from 'bun:test';
import type { RunRecord } from '../../frontend/src/api/types.ts';
import {
	classifyRunRecord,
	filtersForLaunchedRun,
} from '../../frontend/src/pages/runs/runsUtils.ts';

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
	return {
		activityState: null,
		aiddDirty: null,
		aiddRevision: null,
		aiddVersion: null,
		aiSummary: null,
		backend: 'native',
		canKill: false,
		canReadOutput: true,
		canStop: false,
		chainedFromRunId: null,
		completedAt: 1_000,
		continuationReason: null,
		durationMs: 1_000,
		errorMessage: null,
		exitCode: 0,
		heartbeatAt: null,
		id: 'run_record_outcome',
		launchCommand: null,
		logPath: null,
		mode: 'coding',
		model: null,
		pid: null,
		pipelineSessionId: null,
		projectId: 'aidd',
		projectName: 'aidd',
		projectPath: 'd:/applications/aidd',
		provider: null,
		reasoningEffort: null,
		source: 'web',
		startedAt: 1_000,
		status: 'completed',
		stopReason: null,
		stopRequested: false,
		summary: null,
		...overrides,
	};
}

describe('DB run outcome classification', () => {
	test('classifies blocked completion-marker runs as completed with warnings', () => {
		const outcome = classifyRunRecord(
			makeRun({
				exitCode: 7,
				status: 'failed',
				stopReason: 'blocked',
				summary:
					'coding has no incomplete feature work; completion_marker_missing_or_unaccepted: completed allowed feature(s): demo-feature',
			})
		);
		expect(outcome.label).toBe('Completed (warnings)');
		expect(outcome.tone).toBe('amber');
	});

	test('falls back to decoded validation failure when stopReason is unavailable', () => {
		const outcome = classifyRunRecord(makeRun({ exitCode: 7, status: 'failed' }));
		expect(outcome.label).toBe('Validation failed');
		expect(outcome.tone).toBe('red');
	});

	test('classifies dirty-worktree blocked runs explicitly', () => {
		const outcome = classifyRunRecord(
			makeRun({
				exitCode: 7,
				status: 'failed',
				stopReason: 'blocked_dirty_worktree',
			})
		);
		expect(outcome.label).toBe('Blocked: dirty tree');
		expect(outcome.tone).toBe('red');
	});

	test('classifies user-input blocked runs explicitly', () => {
		const outcome = classifyRunRecord(
			makeRun({
				exitCode: 7,
				status: 'failed',
				stopReason: 'blocked_needs_user_input',
			})
		);
		expect(outcome.label).toBe('Blocked: user input');
		expect(outcome.tone).toBe('amber');
	});

	test('reveals a newly launched run regardless of prior activity filters', () => {
		expect(filtersForLaunchedRun(makeRun({ projectPath: 'd:/applications/aidd' }))).toEqual({
			historyProject: 'd:/applications/aidd',
			modeFilter: 'all',
			query: '',
			statusFilter: 'all',
		});
	});
});

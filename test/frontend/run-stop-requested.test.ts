import { describe, expect, test } from 'bun:test';
import type { RunRecord } from '../../frontend/src/api/types.ts';
import {
	clearStopRequested,
	isStopRequested,
	markStopRequested,
	subscribeStopRequests,
} from '../../frontend/src/lib/stopRequests.ts';
import { classifyRunRecord, isRunStopping } from '../../frontend/src/pages/runs/runsUtils.ts';

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
	return {
		activityState: null,
		aiddDirty: null,
		aiddRevision: null,
		aiddVersion: null,
		aiSummary: null,
		backend: 'native',
		canKill: true,
		canReadOutput: true,
		canStop: true,
		chainedFromRunId: null,
		completedAt: null,
		continuationReason: null,
		durationMs: null,
		errorMessage: null,
		exitCode: null,
		heartbeatAt: 1_000,
		id: 'run_stop_requested_ui',
		launchCommand: null,
		logPath: null,
		mode: 'coding',
		model: null,
		pid: 4321,
		pipelineSessionId: null,
		projectId: 'aidd',
		projectName: 'aidd',
		projectPath: 'd:/applications/aidd',
		provider: null,
		reasoningEffort: null,
		source: 'web',
		startedAt: 1_000,
		status: 'running',
		stopReason: null,
		stopRequested: false,
		summary: null,
		...overrides,
	};
}

describe('run stopping state', () => {
	test('a running run with the server-derived flag is stopping', () => {
		expect(isRunStopping(makeRun({ stopRequested: true }), false)).toBe(true);
	});

	test('a locally known stop request marks a running run as stopping ahead of the refetch', () => {
		expect(isRunStopping(makeRun(), true)).toBe(true);
	});

	test('an older-backend payload without the field only stops via the local request', () => {
		const legacy = makeRun();
		delete (legacy as Partial<RunRecord>).stopRequested;
		expect(isRunStopping(legacy, false)).toBe(false);
		expect(isRunStopping(legacy, true)).toBe(true);
	});

	test('a terminal run is never stopping, even with stale flags', () => {
		expect(isRunStopping(makeRun({ status: 'stopped', stopRequested: true }), true)).toBe(
			false,
		);
	});

	test('classifyRunRecord overrides a running row with the Stopping badge', () => {
		const outcome = classifyRunRecord(makeRun(), true);
		expect(outcome.label).toBe('Stopping…');
		expect(outcome.tone).toBe('amber');
	});

	test('classifyRunRecord ignores the stopping override once the run is terminal', () => {
		const outcome = classifyRunRecord(
			makeRun({
				completedAt: 2_000,
				exitCode: 130,
				status: 'stopped',
				stopReason: 'stop_requested',
			}),
			true,
		);
		expect(outcome.label).toBe('Stopped');
	});

	test('a plain running row keeps the Running badge', () => {
		expect(classifyRunRecord(makeRun(), false).label).toBe('Running');
	});
});

describe('stop request tracker', () => {
	test('marks, reports, clears, and notifies subscribers', () => {
		const runId = 'run_tracker_1';
		let notified = 0;
		const unsubscribe = subscribeStopRequests(() => {
			notified += 1;
		});
		try {
			expect(isStopRequested(runId)).toBe(false);
			markStopRequested(runId);
			expect(isStopRequested(runId)).toBe(true);
			expect(notified).toBe(1);
			// Re-marking a known request must not spam subscribers.
			markStopRequested(runId);
			expect(notified).toBe(1);
			clearStopRequested(runId);
			expect(isStopRequested(runId)).toBe(false);
			expect(notified).toBe(2);
			// Clearing an unknown id is a no-op.
			clearStopRequested(runId);
			expect(notified).toBe(2);
		} finally {
			unsubscribe();
			clearStopRequested(runId);
		}
	});
});

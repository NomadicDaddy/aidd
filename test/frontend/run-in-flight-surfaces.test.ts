import { describe, expect, test } from 'bun:test';
import type { RunRecord } from '../../frontend/src/api/types.ts';
import {
	classifyRunRecord,
	inFlightBreakdown,
	inFlightRuns,
} from '../../frontend/src/pages/runs/runsUtils.ts';

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
		driverId: null,
		driverKind: null,
		driverSha256: null,
		errorMessage: null,
		exitCode: null,
		heartbeatAt: 1_000,
		id: 'run_in_flight_ui',
		initiator: null,
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

describe('in-flight run surfaces', () => {
	test('queued runs are listed with running ones, running first, terminal runs dropped', () => {
		const runs = [
			makeRun({ id: 'queued_new', startedAt: 3_000, status: 'queued' }),
			makeRun({ id: 'done', startedAt: 4_000, status: 'completed' }),
			makeRun({ id: 'running_old', startedAt: 1_000 }),
			makeRun({ id: 'queued_old', startedAt: 2_000, status: 'queued' }),
		];
		expect(inFlightRuns(runs).map((run) => run.id)).toEqual([
			'running_old',
			'queued_new',
			'queued_old',
		]);
	});

	test('the breakdown appears only while something is queued', () => {
		expect(inFlightBreakdown([makeRun()])).toBeUndefined();
		expect(
			inFlightBreakdown([
				makeRun(),
				makeRun({ id: 'q1', status: 'queued' }),
				makeRun({ id: 'q2', status: 'queued' }),
			]),
		).toBe('1 running · 2 queued');
		expect(inFlightBreakdown([makeRun({ status: 'queued' })])).toBe('0 running · 1 queued');
	});

	test('a queued run classifies as the shared Queued presentation', () => {
		const outcome = classifyRunRecord(
			makeRun({ heartbeatAt: null, pid: null, status: 'queued' }),
		);
		expect(outcome.label).toBe('Queued');
		expect(outcome.tone).toBe('teal');
	});
});

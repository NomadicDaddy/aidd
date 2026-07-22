import { describe, expect, test } from 'bun:test';
import type { RunRecord } from '../../frontend/src/api/types.ts';
import { runRuntimeDetail } from '../../frontend/src/pages/runs/runRowUtils.ts';
import { classifyRunRecord } from '../../frontend/src/pages/runs/runsUtils.ts';

function makeDirectiveRun(overrides: Partial<RunRecord> = {}): RunRecord {
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
		id: 'run_mode_directive',
		launchCommand: null,
		logPath: null,
		mode: 'directive',
		model: null,
		pid: null,
		pipelineSessionId: 'ps_test',
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

describe('directive run mode display', () => {
	test('runRuntimeDetail renders the directive mode on run rows', () => {
		expect(runRuntimeDetail(makeDirectiveRun())).toBe('mode directive');
	});

	test('directive runs classify through the shared outcome rules', () => {
		const outcome = classifyRunRecord(makeDirectiveRun());
		expect(outcome.label).toBe('Completed');
		expect(outcome.tone).toBe('emerald');
	});
});

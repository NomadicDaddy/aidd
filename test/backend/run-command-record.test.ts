import { describe, expect, test } from 'bun:test';

import type { runs } from '../../backend/src/db/schema.ts';

import { toWebRunRecord } from '../../backend/src/services/run/queries.ts';

type RunRow = typeof runs.$inferSelect;

function makeRow(overrides: Partial<RunRow> = {}): RunRow {
	return {
		activityState: null,
		aiddDirty: null,
		aiddRevision: null,
		aiddVersion: null,
		aiSummary: null,
		backend: 'native',
		cachedTokens: null,
		costUsd: null,
		chainedFromRunId: null,
		commandArgsJson: null,
		completedAt: null,
		continuationReason: null,
		directorCycleId: null,
		durationMs: null,
		driverId: null,
		driverKind: null,
		driverSha256: null,
		errorMessage: null,
		exitCode: null,
		filesChanged: null,
		heartbeatAt: null,
		id: 'run_command_record',
		initiator: null,
		inputTokens: null,
		linesAdded: null,
		linesRemoved: null,
		logPath: null,
		mode: 'coding',
		model: null,
		outputTokens: null,
		pid: null,
		pipelineSessionId: null,
		projectName: 'demo',
		projectPath: 'd:\\applications\\demo',
		provider: null,
		reasoningEffort: null,
		revertedCommits: null,
		scheduledTaskExecutionId: null,
		reasoningTokens: null,
		source: 'web',
		startedAt: 1_000,
		status: 'running',
		stopReason: null,
		summary: null,
		worktreeBranch: null,
		worktreePath: null,
		...overrides,
	};
}

describe('run command records', () => {
	test('serializes exact persisted launch argv', () => {
		const run = toWebRunRecord(
			makeRow({
				commandArgsJson: JSON.stringify([
					'bun',
					'd:\\applications\\aidd\\cli\\src\\index.ts',
					'--project-dir',
					'd:\\applications\\demo',
					'--prompt',
					'do the thing',
				]),
			}),
		);

		expect(run.launchCommand).toEqual({
			args: [
				'bun',
				'd:\\applications\\aidd\\cli\\src\\index.ts',
				'--project-dir',
				'd:\\applications\\demo',
				'--prompt',
				'do the thing',
			],
			display:
				"bun d:\\applications\\aidd\\cli\\src\\index.ts --project-dir d:\\applications\\demo --prompt 'do the thing'",
			source: 'exact',
		});
	});

	test('falls back to reconstructed launch metadata when stored argv is missing or invalid', () => {
		const run = toWebRunRecord(
			makeRow({
				commandArgsJson: '{not json',
				mode: 'audit',
				model: 'glm-5.3',
				reasoningEffort: 'high',
			}),
		);

		expect(run.launchCommand).toEqual({
			args: [
				'aidd',
				'--project-dir',
				'd:\\applications\\demo',
				'--audit-all',
				'--cli',
				'native',
				'--model',
				'glm-5.3',
				'--reasoning-effort',
				'high',
			],
			display:
				'aidd --project-dir d:\\applications\\demo --audit-all --cli native --model glm-5.3 --reasoning-effort high',
			source: 'reconstructed',
		});
	});
});

import { describe, expect, test } from 'bun:test';

import type { RunRecord } from '../../backend/src/types.ts';

import {
	createSetupActivityProvider,
	selectSetupActivity,
	type SetupPipelineSession,
	toPipelineCandidate,
	toRunCandidate,
} from '../../backend/src/services/project/setupActivity.ts';

function run(fields: Pick<RunRecord, 'id' | 'mode' | 'startedAt' | 'status'>): RunRecord {
	return fields as RunRecord;
}

function session(fields: SetupPipelineSession): SetupPipelineSession {
	return fields;
}

describe('blueprint setup activity selection', () => {
	test('a run in an unrelated mode is not blueprint setup work', () => {
		for (const mode of ['audit', 'director', 'todo', 'triumvirate', 'validate'] as const) {
			expect(
				toRunCandidate(run({ id: `run_${mode}`, mode, startedAt: 10, status: 'running' })),
			).toBeNull();
		}
		expect(
			toRunCandidate(
				run({ id: 'run_coding', mode: 'coding', startedAt: 10, status: 'running' }),
			),
		).toMatchObject({ kind: 'run', label: 'The coding run', lifecycle: 'running' });
	});

	// The defect in one line: history presented as activity. A finished run is not work in flight.
	test('completed work is not activity', () => {
		expect(
			toRunCandidate(
				run({ id: 'run_done', mode: 'coding', startedAt: 10, status: 'completed' }),
			),
		).toBeNull();
		for (const status of ['completed', 'completed_with_failures'] as const) {
			expect(
				toPipelineCandidate(
					session({ id: 'pipe', recipeName: 'Intake', startedAt: 10, status }),
				),
			).toBeNull();
		}
	});

	test('maps each live lifecycle to the vocabulary the card states', () => {
		expect(
			toRunCandidate(run({ id: 'r', mode: 'coding', startedAt: 1, status: 'killed' }))
				?.lifecycle,
		).toBe('stopped');
		expect(
			toRunCandidate(run({ id: 'r', mode: 'coding', startedAt: 1, status: 'failed' }))
				?.lifecycle,
		).toBe('failed');
		expect(
			toRunCandidate(
				run({ id: 'r', mode: 'coding', startedAt: 1, status: 'waiting_approval' }),
			)?.lifecycle,
		).toBe('waiting_approval');
		expect(
			toPipelineCandidate(
				session({ id: 'p', recipeName: 'Project intake', startedAt: 1, status: 'queued' }),
			),
		).toMatchObject({ label: 'The Project intake pipeline', lifecycle: 'queued' });
	});

	test('running work outranks queued, and queued outranks terminal', () => {
		const candidates = [
			toRunCandidate(run({ id: 'failed', mode: 'coding', startedAt: 300, status: 'failed' })),
			toPipelineCandidate(
				session({ id: 'queued', recipeName: 'Intake', startedAt: 200, status: 'queued' }),
			),
			toRunCandidate(
				run({ id: 'running', mode: 'coding', startedAt: 100, status: 'running' }),
			),
		];

		expect(selectSetupActivity(candidates)?.reference).toBe('running');
		expect(selectSetupActivity(candidates.slice(0, 2))?.reference).toBe('queued');
		expect(selectSetupActivity(candidates.slice(0, 1))?.reference).toBe('failed');
	});

	test('picks the most recent within one lifecycle', () => {
		expect(
			selectSetupActivity([
				toRunCandidate(
					run({ id: 'older', mode: 'coding', startedAt: 1, status: 'running' }),
				),
				toRunCandidate(
					run({ id: 'newer', mode: 'interview', startedAt: 2, status: 'running' }),
				),
			])?.reference,
		).toBe('newer');
	});

	test('nothing relevant means no activity at all', () => {
		expect(selectSetupActivity([])).toBeNull();
		expect(
			selectSetupActivity([
				toRunCandidate(run({ id: 'a', mode: 'audit', startedAt: 1, status: 'running' })),
				toRunCandidate(run({ id: 'b', mode: 'coding', startedAt: 2, status: 'completed' })),
			]),
		).toBeNull();
	});
});

describe('blueprint setup activity provider', () => {
	test('reports the idle project the defect was filed against', async () => {
		const provider = createSetupActivityProvider({
			listPipelineSessions: () => Promise.resolve([]),
			listRuns: () => Promise.resolve([]),
		});

		expect(await provider('D:/apps/summon')).toBeNull();
	});

	test('asks both sources for the exact project path it was given', async () => {
		const asked: string[] = [];
		const provider = createSetupActivityProvider({
			listPipelineSessions: (path) => {
				asked.push(`pipelines:${path}`);
				return Promise.resolve([]);
			},
			listRuns: (path) => {
				asked.push(`runs:${path}`);
				return Promise.resolve([
					run({ id: 'run_1', mode: 'coding', startedAt: 5, status: 'running' }),
				]);
			},
		});

		expect(await provider('D:/apps/summon')).toMatchObject({ reference: 'run_1' });
		expect([...asked].sort()).toEqual(['pipelines:D:/apps/summon', 'runs:D:/apps/summon']);
	});

	// A project overview that reports an idle project as idle beats one that fails to load.
	test('treats a failing source as nothing found rather than failing the overview', async () => {
		const provider = createSetupActivityProvider({
			listPipelineSessions: () => Promise.reject(new Error('db down')),
			listRuns: () => Promise.reject(new Error('db down')),
		});

		expect(await provider('D:/apps/summon')).toBeNull();
	});
});

import {
	executionStatusPresentation,
	telemetryOutcomeOrder,
	telemetryOutcomePresentation,
} from 'aidd-shared/runs/outcome';
import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import { outcomePattern, outcomeSolid } from '../../frontend/src/lib/series.ts';
import { sessionStatusTone } from '../../frontend/src/pages/runs/pipelineSessionStatus.ts';

const FRONTEND_SRC = resolve(import.meta.dir, '../../frontend/src');

function read(path: string): Promise<string> {
	return Bun.file(join(FRONTEND_SRC, ...path.split('/'))).text();
}

describe('canonical run-status vocabulary', () => {
	test('owns the display word and semantic tone for every execution status', () => {
		expect(executionStatusPresentation.completed).toMatchObject({
			label: 'Completed',
			tone: 'emerald',
		});
		expect(executionStatusPresentation.completed_with_failures).toMatchObject({
			label: 'Completed with failures',
			tone: 'amber',
		});
		expect(executionStatusPresentation.failed).toMatchObject({
			label: 'Failed',
			tone: 'red',
		});
		expect(executionStatusPresentation.killed).toMatchObject({
			label: 'Killed',
			tone: 'neutral',
		});
		expect(executionStatusPresentation.stopped).toMatchObject({
			label: 'Stopped',
			tone: 'neutral',
		});
		expect(sessionStatusTone('stopped')).toBe(executionStatusPresentation.stopped.tone);
	});

	test('owns every telemetry bucket label and semantic tone', () => {
		expect(telemetryOutcomeOrder).toHaveLength(8);
		expect(Object.keys(telemetryOutcomePresentation)).toHaveLength(
			telemetryOutcomeOrder.length,
		);
		for (const outcome of telemetryOutcomeOrder) {
			expect(telemetryOutcomePresentation[outcome]).toBeDefined();
		}
		expect(telemetryOutcomePresentation.killed.label).toBe(
			executionStatusPresentation.killed.label,
		);
		expect(telemetryOutcomePresentation.stopped.tone).toBe(
			executionStatusPresentation.stopped.tone,
		);
	});

	test('pairs every small chart segment with a unique non-colour texture', () => {
		expect(new Set(Object.values(outcomePattern)).size).toBe(telemetryOutcomeOrder.length);
		for (const outcome of telemetryOutcomeOrder) {
			expect(outcomePattern[outcome]).toContain('repeating-linear-gradient');
			expect(outcomeSolid[outcome].length).toBeGreaterThan(0);
		}
	});

	test('routes all six vocabulary consumers through the shared presentation', async () => {
		const [activeRuns, localClassify, localFilters, runFilters, pipelineStatus, invocations] =
			await Promise.all([
				read('pages/projects/detail/ActiveRunsPanel.tsx'),
				read('components/shared/local-aidd-history/outcomeClassify.ts'),
				read('components/shared/local-aidd-history/outcome.ts'),
				read('pages/runs/RunFilters.tsx'),
				read('pages/runs/pipelineSessionStatus.ts'),
				read('pages/telemetry/InvocationsTable.tsx'),
			]);

		expect(activeRuns).toContain('classifyRunRecord(run)');
		expect(localClassify).toContain('return classifyWebRun({');
		expect(localFilters).toContain("'Completed'");
		expect(runFilters).toContain('executionStatusPresentation[value].label');
		expect(pipelineStatus).toContain('executionStatusPresentation[status]');
		expect(invocations).toContain('telemetryOutcomePresentation[');
		expect(invocations).toContain('executionStatusPresentation[invocation.status]');
		for (const source of [
			activeRuns,
			localClassify,
			localFilters,
			runFilters,
			pipelineStatus,
		]) {
			expect(source).not.toContain('Completed w/ failures');
		}
	});
});

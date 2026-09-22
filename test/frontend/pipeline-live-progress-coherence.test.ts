import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { PipelineSessionRecord } from '../../frontend/src/api/types.ts';

import {
	pipelineActiveStepLabel,
	pipelineProgressLabel,
	pipelineStepsCompletedLabel,
} from '../../frontend/src/lib/pipelineProgress.ts';
import { realtimeInvalidationKeysForMessage } from '../../frontend/src/hooks/realtimeInvalidationKeys.ts';
import { toneSolid } from '../../frontend/src/lib/tones.ts';
import { sessionStatusTone } from '../../frontend/src/pages/runs/pipelineSessionStatus.ts';

const FRONTEND_SRC = join(import.meta.dir, '..', '..', 'frontend', 'src');

function makeSession(overrides: Partial<PipelineSessionRecord> = {}): PipelineSessionRecord {
	return {
		activeTopLevelStep: { sequenceNumber: 2, stepName: 'Apply remediation' },
		completedAt: null,
		completedTopLevelSteps: 1,
		durationMs: null,
		errorMessage: null,
		executionIdentities: [],
		id: 'pipe_live',
		parametersJson: '{}',
		parkedWorkRuns: 0,
		projectName: 'aidd',
		projectPath: 'd:/applications/aidd',
		recipeId: 'review-and-remediate',
		recipeName: 'Review and remediate',
		recipeSha256: null,
		skippedTopLevelSteps: 0,
		startedAt: 1,
		status: 'running',
		totalSteps: 3,
		...overrides,
	};
}

async function frontendSource(path: string): Promise<string> {
	return readFile(join(FRONTEND_SRC, path), 'utf8');
}

describe('pipeline live progress coherence', () => {
	test('uses one completed-plus-active label before and after a refresh', () => {
		const listedSession = makeSession();
		const refreshedReportSession = JSON.parse(
			JSON.stringify(listedSession),
		) as PipelineSessionRecord;

		expect(pipelineProgressLabel(listedSession)).toBe('1/3 completed · step 2 active');
		expect(pipelineProgressLabel(refreshedReportSession)).toBe(
			pipelineProgressLabel(listedSession),
		);
		expect(pipelineActiveStepLabel(refreshedReportSession)).toBe(
			'Active step 2 — Apply remediation',
		);
		expect(
			pipelineProgressLabel(
				makeSession({
					activeTopLevelStep: null,
					completedAt: 3,
					completedTopLevelSteps: 3,
					status: 'completed',
				}),
			),
		).toBe('3/3 completed');
		expect(
			pipelineProgressLabel(
				makeSession({
					activeTopLevelStep: null,
					completedAt: 3,
					completedTopLevelSteps: 0,
					status: 'failed',
					totalSteps: 1,
				}),
			),
		).toBe('0/1 completed');
	});

	test('states what the report progress cursor counts and tones every session outcome', () => {
		expect(pipelineStepsCompletedLabel(makeSession())).toBe('1 / 3 steps completed');
		expect(
			pipelineStepsCompletedLabel(makeSession({ completedTopLevelSteps: 1, totalSteps: 1 })),
		).toBe('1 / 1 step completed');
		expect(
			pipelineStepsCompletedLabel(
				makeSession({ completedTopLevelSteps: 0, status: 'failed', totalSteps: 1 }),
			),
		).toBe('0 / 1 step completed');

		const expectedToneClasses = {
			completed: 'bg-emerald-500',
			completed_with_failures: 'bg-amber-500',
			failed: 'bg-red-500',
			queued: 'bg-teal-500',
			running: 'bg-teal-500',
			stopped: 'bg-muted-foreground',
		} as const;
		for (const [status, expectedClass] of Object.entries(expectedToneClasses)) {
			expect(toneSolid[sessionStatusTone(status as keyof typeof expectedToneClasses)]).toBe(
				expectedClass,
			);
		}
	});

	test('invalidates both list and report from a progress event', async () => {
		const contract = await readFile(
			join(import.meta.dir, '..', '..', 'shared', 'src', 'contracts', 'websocket.ts'),
			'utf8',
		);
		expect(contract).toContain("type: 'pipeline_progress'");

		// The realtime layer declares its keys once; see realtime-reconnect-coverage.test.ts for
		// the invariant that reconnect refreshes everything an event refreshes.
		const keys = realtimeInvalidationKeysForMessage({
			payload: {
				activeTopLevelStep: null,
				completedTopLevelSteps: 1,
				sessionId: 'pipe_live',
			},
			type: 'pipeline_progress',
		});
		expect(keys).toContainEqual(['pipeline-sessions']);
		expect(keys).toContainEqual(['pipeline-session-report', 'pipe_live']);
	});

	test('keeps the session list event-driven and all progress surfaces explicit', async () => {
		const hooks = await frontendSource('hooks/usePipelineSessions.ts');
		const listHook = hooks.slice(
			hooks.indexOf('export function usePipelineSessions()'),
			hooks.indexOf('/**', hooks.indexOf('export function usePipelineSessions()')),
		);
		expect(listHook).not.toContain('refetchInterval');

		const [row, consoleSummary, sessionSummary, reportPage, stepSummary] = await Promise.all([
			frontendSource('pages/runs/PipelineSessionRow.tsx'),
			frontendSource('pages/runs/PipelineConsoleSummary.tsx'),
			frontendSource('pages/pipelineSessions/SessionSummaryCard.tsx'),
			frontendSource('pages/pipelineSessions/PipelineSessionReportPage.tsx'),
			frontendSource('pages/pipelineSessions/pipelineSessionSummary.ts'),
		]);
		expect(row).toContain('pipelineProgressLabel(session)');
		expect(consoleSummary).toContain('pipelineProgressLabel(displayedSession)');
		expect(sessionSummary).toContain('completedTopLevelSteps');
		expect(sessionSummary).toContain('pipelineActiveStepLabel(report.session)');
		expect(sessionSummary).toContain('pipelineStepsCompletedLabel(report.session)');
		expect(sessionSummary).toContain('toneSolid[sessionStatusTone(report.session.status)]');
		expect(sessionSummary).not.toContain('className="h-full rounded-full bg-accent"');
		expect(reportPage).toContain('pipelineSessionStepSummary(report.session)');
		expect(stepSummary).toContain('session.activeTopLevelStep');
		expect(stepSummary).toContain('session.completedTopLevelSteps');
		for (const source of [row, consoleSummary, sessionSummary, reportPage, stepSummary]) {
			expect(source).not.toContain('currentStepIndex');
		}
	});
});

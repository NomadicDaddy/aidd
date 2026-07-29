import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { unfinalizedAgentResultMarker } from '../../shared/src/runs/outcome.ts';
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

function renderRunRow(run: RunRecord): string {
	const script = [
		"import { mock } from 'bun:test';",
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { MemoryRouter } from 'react-router';",
		"mock.module('./src/hooks/useStopRequested.ts', () => ({ useStopRequested: () => false }));",
		"const { ActiveRunRow } = await import('./src/pages/runs/ActiveRunRow.tsx');",
		`const run = ${JSON.stringify(run)};`,
		'const row = createElement(ActiveRunRow, { continued: false, continuePendingId: undefined, now: 1000, onContinue: () => {}, onKill: () => {}, onSelect: () => {}, onStop: () => {}, run, selected: false });',
		"const table = createElement('table', null, createElement('tbody', null, row));",
		'console.log(renderToStaticMarkup(createElement(MemoryRouter, null, table)));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) {
		throw new Error(new TextDecoder().decode(result.stderr));
	}
	return new TextDecoder().decode(result.stdout).trim();
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
			}),
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
			}),
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
			}),
		);
		expect(outcome.label).toBe('Blocked: user input');
		expect(outcome.tone).toBe('amber');
	});

	test('renders recovered stale results through the shared outcome classifier', () => {
		const run = makeRun({
			exitCode: -1,
			status: 'failed',
			stopReason: 'heartbeat_stale',
			summary: `${unfinalizedAgentResultMarker} {"featureId":"demo","status":"completed","passes":true}`,
		});
		const outcome = classifyRunRecord(run);
		expect(outcome.label).toBe('Result reported · CLI died');
		expect(outcome.title).toContain('CLI died before aidd could finalize');
		expect(outcome.tone).toBe('amber');
		expect(renderRunRow(run)).toMatch(
			/<span[^>]+bg-amber[^>]*>Result reported · CLI died<\/span>/,
		);
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

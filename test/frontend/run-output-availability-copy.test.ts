import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import type { RunRecord } from '../../frontend/src/api/types.ts';
import type { RunLiveOutput } from '../../frontend/src/hooks/useRunLiveOutput.ts';

const frontendRoot = resolve(import.meta.dir, '../../frontend');

function makeRun(overrides: Partial<RunRecord>): RunRecord {
	return {
		activityState: null,
		aiddDirty: null,
		aiddRevision: null,
		aiddVersion: null,
		aiSummary: null,
		backend: 'codex',
		canKill: false,
		canReadOutput: true,
		canStop: false,
		chainedFromRunId: null,
		completedAt: 2_000,
		continuationReason: null,
		driverId: null,
		driverKind: null,
		driverSha256: null,
		durationMs: 1_000,
		errorMessage: null,
		exitCode: 0,
		heartbeatAt: null,
		id: 'run-output-copy',
		initiator: 'operator',
		launchCommand: null,
		logPath: 'D:\\logs\\run-output-copy.log',
		mode: 'coding',
		model: null,
		pid: null,
		pipelineSessionId: null,
		projectId: 'aidd',
		projectName: 'aidd',
		projectPath: 'D:\\applications\\aidd',
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

function makeOutput(overrides: Partial<RunLiveOutput>): RunLiveOutput {
	return {
		endByte: 0,
		isLoading: false,
		isStreaming: false,
		reason: null,
		startByte: 0,
		state: 'empty',
		text: '',
		totalBytes: 0,
		truncated: false,
		windowLimitBytes: 2 * 1024 * 1024,
		...overrides,
	};
}

function renderPanel(run: RunRecord, output: RunLiveOutput): string {
	const script = String.raw`
import { mock } from 'bun:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const run = ${JSON.stringify(run)};
const output = ${JSON.stringify(output)};
mock.module('./src/hooks/useRunLiveOutput.ts', () => ({
	useRunLiveOutput: (id) => {
		if (id !== run.id) throw new Error('LiveConsolePanel did not request the selected run output');
		return output;
	},
}));
mock.module('./src/pages/runs/LiveConsole.tsx', () => ({
	LiveConsole: ({ badge, hasOutput, message }) => h(
		'div',
		{ 'data-badge': badge?.label ?? '', 'data-has-output': String(hasOutput) },
		message,
	),
}));

const { LiveConsolePanel } = await import('./src/pages/runs/LiveConsolePanel.tsx');
console.log(renderToStaticMarkup(h(LiveConsolePanel, { selectedRun: run, selectedRunId: run.id })));
`;
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: frontendRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return result.stdout.toString().trim();
}

describe('run output availability copy', () => {
	test('renders readable web and CLI heartbeat transcripts', () => {
		const cases = [
			makeRun({ id: 'web-run', source: 'web' }),
			makeRun({ id: 'cli-heartbeat', source: 'cli' }),
		];
		for (const run of cases) {
			const transcript = `${run.source} transcript is readable`;
			const markup = renderPanel(
				run,
				makeOutput({
					endByte: transcript.length,
					state: 'ok',
					text: transcript,
					totalBytes: transcript.length,
				}),
			);
			expect(markup).toContain(transcript);
			expect(markup).toContain('data-has-output="true"');
			expect(markup).not.toContain('available only for UI-launched runs');
		}
	});

	test('renders the server reason for a CLI record without a log path', () => {
		const reason = 'No log path was recorded for this run.';
		const markup = renderPanel(
			makeRun({ canReadOutput: false, id: 'cli-without-log', logPath: null, source: 'cli' }),
			makeOutput({ reason, state: 'cli-only' }),
		);
		expect(markup).toContain(reason);
		expect(markup).toContain('data-badge="unavailable"');
		expect(markup).not.toContain('available only for UI-launched runs');
	});

	test('renders the server reason when the recorded log file is missing', () => {
		const reason = 'Log file is missing on disk: D:\\logs\\missing.log';
		const markup = renderPanel(
			makeRun({ id: 'cli-missing-log', source: 'cli' }),
			makeOutput({ reason, state: 'unavailable' }),
		);
		expect(markup).toContain(reason);
		expect(markup).toContain('data-badge="unavailable"');
		expect(markup).not.toContain('available only for UI-launched runs');
	});
});

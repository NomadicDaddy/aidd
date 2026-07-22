import { describe, expect, test } from 'bun:test';
import {
	formatProgressDuration,
	OrchestratorProgressReporter,
} from '../../cli/src/orchestrator/progress.ts';

describe('orchestrator progress reporter', () => {
	test('formats elapsed durations with stable hour-minute-second fields', () => {
		expect(formatProgressDuration(0)).toBe('00:00:00');
		expect(formatProgressDuration(59_499)).toBe('00:00:59');
		expect(formatProgressDuration(60_000)).toBe('00:01:00');
		expect(formatProgressDuration(125_000)).toBe('00:02:05');
		expect(formatProgressDuration(3_605_000)).toBe('01:00:05');
	});

	test('writes durable heartbeat lines with elapsed and idle context', () => {
		let now = 0;
		const lines: string[] = [];
		const reporter = new OrchestratorProgressReporter({
			backend: 'codex',
			heartbeatMs: 0,
			iteration: 0,
			iterationStartedAtMs: 0,
			now: () => now,
			runStartedAtMs: 0,
			write: (line) => lines.push(line),
		});

		reporter.setStage('waiting_for_backend', {
			activity: true,
			last: 'backend codex started',
		});
		now = 145_000;
		reporter.recordAgentEvent({
			args: { command: 'bun run smoke:qc' },
			tool: 'bash',
			type: 'tool_call',
		});
		now = 270_000;
		reporter.writeHeartbeat();

		const heartbeat = lines.at(-1);
		if (heartbeat === undefined) throw new Error('expected heartbeat output');
		expect(heartbeat).toContain('[00:04:30]');
		expect(heartbeat).toContain('00:04:30 | 01 | 00:04:30');
		expect(heartbeat).toContain('tool call');
		expect(heartbeat).toContain('idle 00:02:05');
		expect(heartbeat).toContain('last tool bash "bun run smoke:qc"');
	});
});

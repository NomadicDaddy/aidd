import { describe, expect, test } from 'bun:test';
import type { AgentEvent } from 'aidd-shared/backends/types';

import {
	defaultFlailingConfig,
	FlailingDetector,
	isFlailingGuardDisabled,
} from 'aidd-shared/backends/flailing';

function bash(command: string): AgentEvent {
	return { args: { command }, tool: 'bash', type: 'tool_call' };
}

function edit(path: string): AgentEvent {
	return { args: { file_path: path }, tool: 'edit_file', type: 'tool_call' };
}

function read(path: string): AgentEvent {
	return { args: { file_path: path }, tool: 'read_file', type: 'tool_call' };
}

function lastSignal(detector: FlailingDetector, events: AgentEvent[]) {
	let result = detector.record(events[0]!);
	for (const event of events.slice(1)) result = detector.record(event);
	return result;
}

describe('FlailingDetector', () => {
	test('trips on server-diagnostic thrash with varied commands and no file edits', () => {
		const detector = new FlailingDetector();
		// Mirrors the real incident: hunting for / starting a server with different commands each time.
		const events: AgentEvent[] = [
			bash('curl -s http://localhost:3440'),
			bash('curl -s http://localhost:3441'),
			bash('curl -s http://localhost:3210'),
			bash('ps aux | grep vite'),
			bash('ps -ef | grep bun'),
			bash('which bun'),
			bash('lsof -ti:3210'),
			bash('netstat -ano | findstr :3210'),
			bash('curl -s http://localhost:3210'),
			bash('bun run start:web'),
		];
		let tripped = false;
		for (const event of events) {
			if (detector.record(event).kind === 'trip') tripped = true;
		}
		expect(tripped).toBe(true);
	});

	test('trips on the same command repeated', () => {
		const detector = new FlailingDetector();
		const signal = lastSignal(
			detector,
			Array.from({ length: defaultFlailingConfig.repeatTripThreshold }, () =>
				bash('curl -s http://localhost:3210'),
			),
		);
		expect(signal.kind).toBe('trip');
		if (signal.kind === 'trip') expect(signal.reason).toBe('repeated_action');
	});

	test('does NOT trip on browser snapshots interleaved with interactions', () => {
		const detector = new FlailingDetector();
		const events: AgentEvent[] = [bash('agent-browser snapshot -i -c')];
		for (const ref of ['@e9', '@e13', '@e8', '@e14']) {
			events.push(bash(`agent-browser click ${ref}`));
			events.push(bash('agent-browser snapshot -i -c'));
		}

		let tripped = false;
		for (const event of events) {
			if (detector.record(event).kind === 'trip') tripped = true;
		}
		expect(tripped).toBe(false);
	});

	test('a different tool call breaks the repeated-action streak', () => {
		const detector = new FlailingDetector();
		const repeated = defaultFlailingConfig.repeatTripThreshold - 1;
		const events = [
			...Array.from({ length: repeated }, () => read('src/feature.ts')),
			read('src/other.ts'),
			...Array.from({ length: repeated }, () => read('src/feature.ts')),
		];

		expect(lastSignal(detector, events).kind).not.toBe('trip');
	});

	test('a file edit resets the repeated-action streak', () => {
		const detector = new FlailingDetector();
		const repeated = defaultFlailingConfig.repeatTripThreshold - 1;
		const events = [
			...Array.from({ length: repeated }, () => read('src/feature.ts')),
			edit('src/feature.ts'),
			...Array.from({ length: repeated }, () => read('src/feature.ts')),
		];

		expect(lastSignal(detector, events).kind).not.toBe('trip');
	});

	test('does NOT trip on long read-only exploration', () => {
		const detector = new FlailingDetector();
		let tripped = false;
		for (let i = 0; i < 40; i++) {
			if (detector.record(read(`src/file-${i}.ts`)).kind === 'trip') tripped = true;
		}
		expect(tripped).toBe(false);
	});

	test('a file edit resets accumulated diagnostic churn', () => {
		const detector = new FlailingDetector();
		// Nine diagnostics (one below the trip threshold), an edit, then nine more — never reaching
		// the threshold within a single no-edit window, so it must not trip.
		let tripped = false;
		const burst = () => {
			for (let i = 0; i < defaultFlailingConfig.diagnosticTripThreshold - 1; i++) {
				if (detector.record(bash(`curl -s http://localhost:${3200 + i}`)).kind === 'trip') {
					tripped = true;
				}
			}
		};
		burst();
		detector.record(edit('src/feature.ts'));
		burst();
		expect(tripped).toBe(false);
	});

	test('emits a warn before it trips', () => {
		const detector = new FlailingDetector();
		const signals = Array.from(
			{ length: defaultFlailingConfig.diagnosticTripThreshold },
			(_, i) => detector.record(bash(`curl -s http://localhost:${3200 + i}`)),
		);
		const warnIndex = signals.findIndex((s) => s.kind === 'warn');
		const tripIndex = signals.findIndex((s) => s.kind === 'trip');
		expect(warnIndex).toBeGreaterThanOrEqual(0);
		expect(tripIndex).toBeGreaterThan(warnIndex);
	});

	test('non-tool-call events are ignored', () => {
		const detector = new FlailingDetector();
		expect(detector.record({ chunk: 'thinking', type: 'assistant_text' }).kind).toBe('none');
	});
});

describe('isFlailingGuardDisabled', () => {
	test('honors the opt-out env var', () => {
		expect(isFlailingGuardDisabled({ AIDD_DISABLE_FLAILING_GUARD: '1' })).toBe(true);
		expect(isFlailingGuardDisabled({ AIDD_DISABLE_FLAILING_GUARD: 'true' })).toBe(true);
		expect(isFlailingGuardDisabled({})).toBe(false);
	});
});

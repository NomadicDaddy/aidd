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

function bashIn(command: string, cwd: string): AgentEvent {
	return { args: { command, cwd }, tool: 'bash', type: 'tool_call' };
}

function edit(path: string): AgentEvent {
	return { args: { file_path: path }, tool: 'edit_file', type: 'tool_call' };
}

function read(path: string): AgentEvent {
	return { args: { file_path: path }, tool: 'read_file', type: 'tool_call' };
}

function result(text: string): AgentEvent {
	return { result: text, tool: 'bash', type: 'tool_result' };
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

	// The real incident: a release pipeline polling `gh pr checks` while CI ran was killed as
	// flailing on the fifth identical poll. A repeat whose output keeps changing is an agent
	// watching a system in flux, not one replaying a dead action.
	test('does NOT trip on a repeated poll whose output keeps changing', () => {
		const detector = new FlailingDetector();
		const poll = bash("pwsh -Command 'Start-Sleep -Seconds 30; gh pr checks 2 --json state'");
		let tripped = false;
		for (let i = 0; i < defaultFlailingConfig.variedRepeatTripThreshold - 1; i++) {
			if (detector.record(poll).kind === 'trip') tripped = true;
			detector.record(result(`{"state":"pending","elapsed":${i}}`));
		}
		expect(tripped).toBe(false);
	});

	test('still trips on a repeated call whose output never changes', () => {
		const detector = new FlailingDetector();
		const poll = bash('gh pr checks 2 --json state');
		let signal = detector.record(poll);
		for (let i = 1; i < defaultFlailingConfig.repeatTripThreshold; i++) {
			detector.record(result('no checks reported'));
			signal = detector.record(poll);
		}
		expect(signal.kind).toBe('trip');
	});

	test('a poll that never resolves still trips at the varied-repeat backstop', () => {
		const detector = new FlailingDetector();
		const poll = bash('gh pr checks 2 --json state');
		let tripped = false;
		for (let i = 0; i < defaultFlailingConfig.variedRepeatTripThreshold; i++) {
			if (detector.record(poll).kind === 'trip') tripped = true;
			detector.record(result(`{"state":"pending","elapsed":${i}}`));
		}
		expect(tripped).toBe(true);
	});

	// Windows backends wrap every command as `"C:\Program Files\PowerShell\7\pwsh.exe" -Command
	// '<real command>'`. Classifying on the outer token resolved that to "program" (the space in
	// "Program Files" split the path), hiding every diagnostic verb behind the wrapper.
	test('classifies a quoted Windows shell wrapper on its inner program', () => {
		const detector = new FlailingDetector();
		let tripped = false;
		for (let i = 0; i < defaultFlailingConfig.diagnosticTripThreshold; i++) {
			const event = bash(
				`"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command 'curl -s http://localhost:${3200 + i}'`,
			);
			if (detector.record(event).kind === 'trip') tripped = true;
		}
		expect(tripped).toBe(true);
	});

	// The real incident: the `dance` fleet release checked the clean-tree precondition across 11
	// scoped checkouts with one identical `git status` each, and was killed on the fifth.
	test('does NOT trip on the same command run against different working directories', () => {
		const detector = new FlailingDetector();
		let tripped = false;
		for (let i = 0; i < 11; i++) {
			const event = bashIn('git status --porcelain', `D:\\applications\\app-${i}`);
			if (detector.record(event).kind === 'trip') tripped = true;
			detector.record(result(''));
		}
		expect(tripped).toBe(false);
	});

	test('still trips when the repeated command shares one working directory', () => {
		const detector = new FlailingDetector();
		const events: AgentEvent[] = [];
		// Same directory spelled three ways — separators, case, and a trailing slash must not
		// manufacture distinct signatures out of one location.
		for (const cwd of [
			'D:\\applications\\app',
			'd:/applications/app',
			'D:/Applications/App/',
		]) {
			events.push(bashIn('git status --porcelain', cwd));
		}
		events.push(bashIn('git status --porcelain', 'D:\\applications\\app'));
		events.push(bashIn('git status --porcelain', 'd:\\applications\\app'));
		expect(lastSignal(detector, events).kind).toBe('trip');
	});

	// Parallel dispatch: every call goes out before any result comes back, so none of them can be a
	// reaction to another and the streak must not treat them as consecutive replays.
	test('does NOT trip on identical calls dispatched in one parallel batch', () => {
		const detector = new FlailingDetector();
		detector.record(bash('git rev-parse --show-toplevel'));
		detector.record(result('D:/applications/spernakit'));
		let tripped = false;
		for (let i = 0; i < 11; i++) {
			if (detector.record(bash('git status --porcelain')).kind === 'trip') tripped = true;
		}
		expect(tripped).toBe(false);
	});

	test('a batch does not disable detection for the sequential calls after it', () => {
		const detector = new FlailingDetector();
		detector.record(bash('git rev-parse --show-toplevel'));
		detector.record(result('D:/applications/spernakit'));
		for (let i = 0; i < 11; i++) detector.record(bash('git status --porcelain'));
		for (let i = 0; i < 11; i++) detector.record(result('unchanged'));

		const poll = bash('curl -s http://localhost:3210');
		let signal = detector.record(poll);
		for (let i = 1; i < defaultFlailingConfig.repeatTripThreshold; i++) {
			detector.record(result('connection refused'));
			signal = detector.record(poll);
		}
		expect(signal.kind).toBe('trip');
	});

	// Codex reports a file change as a tool call with no matching result. Counted as permanently
	// in flight, those would make every later call look batched and blind the guard. (The batch
	// exemption also requires a result to have been seen at all, so a backend that reports none
	// keeps the stricter old behavior — covered by 'trips on the same command repeated' above.)
	test('edits that report no result do not leave later calls looking batched', () => {
		const detector = new FlailingDetector();
		detector.record(bash('git status --porcelain'));
		detector.record(result('M src/feature.ts'));
		for (let i = 0; i < 3; i++) detector.record(edit(`src/feature-${i}.ts`));

		const poll = bash('curl -s http://localhost:3210');
		let signal = detector.record(poll);
		for (let i = 1; i < defaultFlailingConfig.repeatTripThreshold; i++) {
			detector.record(result('connection refused'));
			signal = detector.record(poll);
		}
		expect(signal.kind).toBe('trip');
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

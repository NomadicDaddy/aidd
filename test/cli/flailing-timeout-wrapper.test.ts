import { describe, expect, test } from 'bun:test';
import type { AgentEvent } from 'aidd-shared/backends/types';

import { defaultFlailingConfig, FlailingDetector } from 'aidd-shared/backends/flailing';

function bash(command: string): AgentEvent {
	return { args: { command }, tool: 'bash', type: 'tool_call' };
}

function result(text: string): AgentEvent {
	return { result: text, tool: 'bash', type: 'tool_result' };
}

// `timeout N <command>` bounds a command's runtime; it is a wrapper like `pwsh -Command`, not a
// server probe. Classifying on the outer token made every bounded command look diagnostic.
describe('FlailingDetector: timeout as a wrapper', () => {
	// The real incident: run_1790688780168_fff25741, the daily news digest, read one article per
	// call with `CHARS=1100 timeout 500 bun /tmp/art.ts <url>` and was aborted as diagnostic thrash
	// on the tenth read, although every call fetched a different URL and returned different text.
	test('does NOT trip on varied commands bounded by timeout', () => {
		const detector = new FlailingDetector();
		let tripped = false;
		for (let i = 0; i < defaultFlailingConfig.diagnosticTripThreshold + 2; i++) {
			const event = bash(
				`CHARS=1100 timeout 500 bun /tmp/art.ts "https://example.com/story-${i}"`,
			);
			if (detector.record(event).kind === 'trip') tripped = true;
			detector.record(result(`article ${i}`));
		}
		expect(tripped).toBe(false);
	});

	test('still classifies a diagnostic verb inside timeout as diagnostic', () => {
		const detector = new FlailingDetector();
		let tripped = false;
		for (let i = 0; i < defaultFlailingConfig.diagnosticTripThreshold; i++) {
			const event = bash(`timeout -k 5 30 curl -s http://localhost:${3200 + i}/health`);
			if (detector.record(event).kind === 'trip') tripped = true;
			detector.record(result(`probe ${i}`));
		}
		expect(tripped).toBe(true);
	});

	// With nothing to wrap, `timeout` is a wait: cmd.exe's `timeout /t 5` or a bare `timeout 5`.
	test('keeps a bare timeout with no command diagnostic', () => {
		const detector = new FlailingDetector();
		let tripped = false;
		for (let i = 0; i < defaultFlailingConfig.diagnosticTripThreshold; i++) {
			const event = bash(i % 2 === 0 ? `timeout /t ${5 + i} /nobreak` : `timeout ${5 + i}`);
			if (detector.record(event).kind === 'trip') tripped = true;
			detector.record(result(''));
		}
		expect(tripped).toBe(true);
	});
});

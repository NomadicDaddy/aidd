import { describe, expect, test } from 'bun:test';
import type { AgentEvent } from 'aidd-shared/backends/types';
import { LiveDeltaPump, LiveTextGate } from 'aidd-shared/agent/live-deltas';

async function collect(generator: AsyncGenerator<AgentEvent, unknown>): Promise<{
	events: AgentEvent[];
	returned: unknown;
}> {
	const events: AgentEvent[] = [];
	let step = await generator.next();
	while (!step.done) {
		events.push(step.value);
		step = await generator.next();
	}
	return { events, returned: step.value };
}

describe('LiveTextGate', () => {
	test('streams narration while holding back a marker-sized tail, released on flush', () => {
		const gate = new LiveTextGate();
		const first = gate.push('Reviewing the auth guard now.');
		// The last `resultMarker.length - 1` (11) chars stay held back until more text arrives.
		expect(first).toBe('Reviewing the auth');
		expect(gate.push(' Done.')).toBe(' guard');
		expect(gate.flush()).toBe(' now. Done.\n');
	});

	test('suppresses the AIDD_RESULT payload and emits the compact note instead', () => {
		const gate = new LiveTextGate();
		const out =
			gate.push('All finished. AIDD_RESULT: {"status":"completed"') +
			gate.push(',"passes":true}') +
			gate.flush();
		expect(out).toBe('All finished.\nAIDD_RESULT: { … }\n');
		expect(out).not.toContain('"status"');
	});

	test('never leaks a marker that straddles two chunks', () => {
		const gate = new LiveTextGate();
		const out = gate.push('Done. AIDD_RES') + gate.push('ULT: {"a":1}') + gate.flush();
		expect(out).toBe('Done.\nAIDD_RESULT: { … }\n');
	});

	test('handles a marker-only response without stray separators', () => {
		const gate = new LiveTextGate();
		const out = gate.push('AIDD_RESULT: {"passes":true}') + gate.flush();
		expect(out).toBe('AIDD_RESULT: { … }\n');
	});

	test('consumes leading whitespace and terminates emitted text with a newline', () => {
		const gate = new LiveTextGate();
		expect(gate.push('\n\n  ')).toBe('');
		const out = gate.push('Starting the review of the migration.') + gate.flush();
		expect(out).toBe('Starting the review of the migration.\n');
	});

	test('emits nothing for a whitespace-only stream', () => {
		const gate = new LiveTextGate();
		expect(gate.push('  \n \t ')).toBe('');
		expect(gate.flush()).toBe('');
	});
});

describe('LiveDeltaPump', () => {
	test('yields streamed deltas as assistant_delta events before the completion resolves', async () => {
		const pump = new LiveDeltaPump();
		let resolve!: (value: string) => void;
		const completion = new Promise<string>((r) => {
			resolve = r;
		});
		const generator = pump.run(completion);

		pump.onDelta({ kind: 'reasoning', text: 'weighing options' });
		pump.onDelta({ kind: 'text', text: 'Narration long enough to clear the hold-back.' });
		const first = await generator.next();
		expect(first.value).toEqual({
			chunk: 'weighing options',
			kind: 'reasoning',
			type: 'assistant_delta',
		});
		const second = await generator.next();
		expect(second.value).toEqual({
			chunk: 'Narration long enough to clear the',
			kind: 'text',
			type: 'assistant_delta',
		});

		resolve('final');
		const { events, returned } = await collect(generator);
		// The held-back tail is flushed once the completion settles.
		expect(events).toEqual([{ chunk: ' hold-back.\n', kind: 'text', type: 'assistant_delta' }]);
		expect(returned).toBe('final');
	});

	test('coalesces contiguous same-kind deltas into one event per drain', async () => {
		const pump = new LiveDeltaPump();
		pump.onDelta({ kind: 'reasoning', text: 'a' });
		pump.onDelta({ kind: 'reasoning', text: 'b' });
		pump.onDelta({ kind: 'reasoning', text: 'c' });
		const { events } = await collect(pump.run(Promise.resolve('done')));
		expect(events).toEqual([{ chunk: 'abc', kind: 'reasoning', type: 'assistant_delta' }]);
	});

	test('propagates a rejected completion after draining queued deltas', async () => {
		const pump = new LiveDeltaPump();
		pump.onDelta({ kind: 'reasoning', text: 'thinking' });
		const generator = pump.run(Promise.reject(new Error('provider exploded')));
		const first = await generator.next();
		expect(first.value).toEqual({
			chunk: 'thinking',
			kind: 'reasoning',
			type: 'assistant_delta',
		});
		await expect(generator.next()).rejects.toThrow('provider exploded');
	});

	test('passes a delta-less completion straight through', async () => {
		const pump = new LiveDeltaPump();
		const { events, returned } = await collect(pump.run(Promise.resolve('quiet')));
		expect(events).toEqual([]);
		expect(returned).toBe('quiet');
	});
});

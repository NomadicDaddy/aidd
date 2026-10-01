import { describe, expect, test } from 'bun:test';
import { monitorBackend, type MonitorOptions } from 'aidd-shared/backends/monitor';
import type { AgentEvent, CLIBackend, PromptInput } from 'aidd-shared/backends/types';

// A backend that issues one tool call, stays silent while it "runs", then reports the result.
class LongToolBackend implements CLIBackend {
	readonly idleDefaults = { killMs: 30, nudgeMs: 10 };
	readonly name = 'native' as const;
	private readonly args: unknown;
	private readonly toolRunsMs: number;

	constructor(args: unknown, toolRunsMs: number) {
		this.args = args;
		this.toolRunsMs = toolRunsMs;
	}

	async *runPrompt(_input: PromptInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
		yield { args: this.args, tool: 'bash', type: 'tool_call' };
		await Bun.sleep(this.toolRunsMs);
		if (signal.aborted) return;
		yield { result: 'gate passed', tool: 'bash', type: 'tool_result' };
		yield { exitCode: 0, filesModified: [], type: 'done' };
	}
}

async function collect(backend: CLIBackend, options: MonitorOptions = {}): Promise<AgentEvent[]> {
	const events: AgentEvent[] = [];
	for await (const event of monitorBackend(
		backend,
		{ cwd: '.', text: 'prompt' },
		new AbortController().signal,
		options,
	)) {
		events.push(event);
	}
	return events;
}

const idleKilled = (events: AgentEvent[]) =>
	events.some((event) => event.type === 'error' && event.reason === 'idle');

// The real incident: run cli_1790802515910_0ae50fe6 ran a full `bun run smoke:qc` as one bash call
// with timeout_ms 1500000. The call emits nothing until it returns, the monitor counted that as
// idle, and it killed the backend at 900 s while the gate was still running and about to pass.
describe('monitorBackend with a tool call in flight', () => {
	test('does not idle-kill a call still inside the timeout it declared', async () => {
		const events = await collect(new LongToolBackend({ command: 'gate', timeout_ms: 500 }, 90));
		expect(idleKilled(events)).toBe(false);
		expect(events.some((event) => event.type === 'done')).toBe(true);
	});

	test('still idle-kills a call that outlives its own declared timeout', async () => {
		const events = await collect(new LongToolBackend({ command: 'gate', timeout_ms: 40 }, 400));
		expect(idleKilled(events)).toBe(true);
	});

	// A backend that never reports results must not be able to switch the idle guard off, so a
	// call that declares no timeout keeps the plain kill window.
	test('keeps the plain kill window for a call that declares no timeout', async () => {
		const events = await collect(new LongToolBackend({ command: 'gate' }, 90));
		expect(idleKilled(events)).toBe(true);
	});

	test('caps the declared timeout so a huge value cannot disable the guard', async () => {
		const backend = new LongToolBackend({ command: 'gate', timeout_ms: 86_400_000 }, 400);
		const events = await collect(backend, { toolTimeoutCeilingMs: 40 });
		expect(idleKilled(events)).toBe(true);
	});
});

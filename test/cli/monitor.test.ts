import { describe, expect, test } from 'bun:test';
import { monitorBackend } from 'aidd-shared/backends/monitor';
import { runProcessBackend, shouldDetachProcessBackend } from 'aidd-shared/backends/process';
import type { CLIBackend, PromptInput, AgentEvent } from 'aidd-shared/backends/types';

class SilentBackend implements CLIBackend {
	readonly name = 'native' as const;
	readonly idleDefaults = { nudgeMs: 5, killMs: 20 };

	async *runPrompt(_input: PromptInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
		await Bun.sleep(50);
		if (signal.aborted) return;
		yield { type: 'done', exitCode: 0, filesModified: [] };
	}
}

class AbortIgnoringBackend implements CLIBackend {
	readonly name = 'native' as const;
	readonly idleDefaults = { nudgeMs: 5, killMs: 10 };

	async *runPrompt(_input: PromptInput, _signal: AbortSignal): AsyncIterable<AgentEvent> {
		await new Promise(() => {});
		yield* [];
	}
}

async function collect(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
	const events: AgentEvent[] = [];
	for await (const event of iterable) events.push(event);
	return events;
}

function timeout(ms: number): Promise<never> {
	return new Promise((_, reject) =>
		setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
	);
}

describe('monitorBackend', () => {
	test('keeps Windows process backends attached to avoid visible orphaned terminals', () => {
		expect(shouldDetachProcessBackend('win32')).toBe(false);
		expect(shouldDetachProcessBackend('linux')).toBe(true);
		expect(shouldDetachProcessBackend('darwin')).toBe(true);
	});

	test('emits idle warning then idle error for silent backend', async () => {
		const events: AgentEvent[] = [];
		for await (const event of monitorBackend(
			new SilentBackend(),
			{ text: 'prompt', cwd: '.' },
			new AbortController().signal
		)) {
			events.push(event);
		}
		expect(events.some((event) => event.type === 'idle_warning')).toBe(true);
		expect(events.some((event) => event.type === 'error' && event.reason === 'idle')).toBe(
			true
		);
	});

	test('does not hang when idle backend ignores abort during cleanup', async () => {
		const events = await Promise.race([
			collect(
				monitorBackend(
					new AbortIgnoringBackend(),
					{ text: 'prompt', cwd: '.' },
					new AbortController().signal,
					{ cleanupTimeoutMs: 5 }
				)
			),
			timeout(100),
		]);

		expect(events.some((event) => event.type === 'idle_warning')).toBe(true);
		expect(events.some((event) => event.type === 'error' && event.reason === 'idle')).toBe(
			true
		);
	});

	test('streams raw_log incrementally without re-emitting the full transcript', async () => {
		// Two writes separated by a delay land in separate stream reads, so a backend that streams
		// incrementally yields one raw_log per chunk. A single late full-transcript dump (the old
		// behavior) would instead yield one combined raw_log and double-log when added to the
		// incremental chunks. Assert both: ≥2 stdout raw_log events and chunks that concatenate to
		// exactly the transcript (no duplication).
		const events = await collect(
			runProcessBackend(
				{
					backend: 'codex',
					command: process.execPath,
					args: [
						'-e',
						"process.stdout.write('aidd-chunk-1\\n'); setTimeout(() => process.stdout.write('aidd-chunk-2\\n'), 60);",
					],
				},
				{ text: 'prompt', cwd: '.' },
				new AbortController().signal
			)
		);

		const stdoutChunks = events
			.filter((event) => event.type === 'raw_log' && event.stream === 'stdout')
			.map((event) => (event.type === 'raw_log' ? event.chunk : ''));
		expect(stdoutChunks.length).toBeGreaterThanOrEqual(2);
		expect(stdoutChunks.join('')).toBe('aidd-chunk-1\naidd-chunk-2\n');
		expect(events.some((event) => event.type === 'done')).toBe(true);
	});

	test('process backend exits promptly on abort', async () => {
		const controller = new AbortController();
		const eventsPromise = collect(
			runProcessBackend(
				{
					backend: 'codex',
					command: process.execPath,
					args: ['-e', 'setInterval(function noop() { return undefined; }, 1000)'],
				},
				{ text: 'prompt', cwd: '.' },
				controller.signal
			)
		);

		setTimeout(() => controller.abort('test abort'), 20);
		const events = await Promise.race([eventsPromise, timeout(1000)]);

		expect(events.some((event) => event.type === 'error' && event.reason === 'aborted')).toBe(
			true
		);
		expect(events.some((event) => event.type === 'error' && event.reason === 'provider')).toBe(
			false
		);
	});
});

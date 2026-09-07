import { describe, expect, test } from 'bun:test';
import type { AgentClient } from 'aidd-shared/agent/client';
import type { AgentEvent } from 'aidd-shared/backends/types';
import { NativeBackend } from 'aidd-shared/backends/native';

async function collect(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
	const events: AgentEvent[] = [];
	for await (const event of stream) {
		events.push(event);
	}
	return events;
}

describe('Native backend', () => {
	test('runs through the native in-process loop', async () => {
		const client: AgentClient = {
			async complete() {
				return { text: 'native response', filesModified: ['src/app.ts'] };
			},
		};

		const backend = new NativeBackend({ client });
		const events = await collect(
			backend.runPrompt(
				{
					text: 'Do the work.',
					cwd: 'D:/applications/demo',
				},
				new AbortController().signal,
			),
		);

		expect(events).toEqual([
			{ type: 'started', backend: 'native' },
			{ type: 'assistant_text', chunk: 'native response' },
			{ type: 'done', exitCode: 0, filesModified: ['src/app.ts'] },
		]);
	});
});

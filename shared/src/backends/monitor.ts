import { setTimeout as sleep } from 'node:timers/promises';

import type { AgentEvent, CLIBackend, PromptInput } from './types.ts';

export interface MonitorOptions {
	cleanupTimeoutMs?: number;
	idleNudgeTimeoutMs?: number;
	idleTimeoutMs?: number;
}

export async function* monitorBackend(
	backend: CLIBackend,
	input: PromptInput,
	signal: AbortSignal,
	options: MonitorOptions = {},
): AsyncIterable<AgentEvent> {
	const controller = new AbortController();
	const relayAbort = () => controller.abort(signal.reason);
	signal.addEventListener('abort', relayAbort, { once: true });

	const killMs = options.idleTimeoutMs ?? backend.idleDefaults.killMs;
	const warningMs = options.idleNudgeTimeoutMs ?? backend.idleDefaults.nudgeMs;
	const cleanupTimeoutMs = options.cleanupTimeoutMs ?? 1000;
	const stream = backend.runPrompt(input, controller.signal)[Symbol.asyncIterator]();
	let nextEvent = stream.next();
	let lastActivity = Date.now();
	let warned = false;
	try {
		while (true) {
			const elapsed = Date.now() - lastActivity;
			const waits: Promise<'kill' | 'warn' | IteratorResult<AgentEvent>>[] = [nextEvent];
			if (!warned) waits.push(sleep(warningMs - elapsed, 'warn'));
			waits.push(sleep(killMs - elapsed, 'kill'));
			const result = await Promise.race(waits);
			if (result === 'warn') {
				warned = true;
				yield { afterMs: warningMs, type: 'idle_warning' };
				continue;
			}
			if (result === 'kill') {
				controller.abort('idle');
				yield { meta: { killMs }, reason: 'idle', type: 'error' };
				break;
			}
			if (result.done) break;
			const event = result.value;
			if (
				event.type === 'assistant_delta' ||
				event.type === 'assistant_text' ||
				event.type === 'tool_call' ||
				event.type === 'tool_result'
			) {
				lastActivity = Date.now();
				warned = false;
			}
			nextEvent = stream.next();
			yield event;
		}
	} finally {
		const cleanup = stream.return?.();
		if (cleanup) await Promise.race([cleanup, sleep(cleanupTimeoutMs, undefined)]);
		signal.removeEventListener('abort', relayAbort);
	}
}

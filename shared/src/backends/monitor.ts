import { setTimeout as sleep } from 'node:timers/promises';

import type { AgentEvent, CLIBackend, PromptInput } from './types.ts';

export interface MonitorOptions {
	cleanupTimeoutMs?: number;
	idleNudgeTimeoutMs?: number;
	idleTimeoutMs?: number;
	toolTimeoutCeilingMs?: number;
}

// A tool call emits nothing until it returns, so a full quality gate run as one call looked idle
// and was killed mid-run (cli_1790802515910_0ae50fe6: timeout_ms 1500000 against a 900 s kill).
// The call's own declared timeout bounds it instead, up to this ceiling so that a huge declared
// value cannot switch the idle guard off.
const defaultToolTimeoutCeilingMs = 1_800_000;

function declaredToolTimeoutMs(args: unknown): number {
	if (typeof args !== 'object' || args === null || !('timeout_ms' in args)) return 0;
	const value = args.timeout_ms;
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
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
	const toolTimeoutCeilingMs = options.toolTimeoutCeilingMs ?? defaultToolTimeoutCeilingMs;
	// Extra silence allowed while tool calls that declared a timeout are still in flight.
	let toolAllowanceMs = 0;
	let toolsInFlight = 0;
	try {
		while (true) {
			const elapsed = Date.now() - lastActivity - toolAllowanceMs;
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
				if (event.type === 'tool_call') {
					const declared = Math.min(
						declaredToolTimeoutMs(event.args),
						toolTimeoutCeilingMs,
					);
					toolsInFlight += 1;
					toolAllowanceMs = Math.max(toolAllowanceMs, declared);
				} else {
					// Assistant output means every call has returned, so a backend that reports
					// calls without results cannot keep the allowance alive.
					toolsInFlight =
						event.type === 'tool_result' ? Math.max(0, toolsInFlight - 1) : 0;
					if (toolsInFlight === 0) toolAllowanceMs = 0;
				}
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

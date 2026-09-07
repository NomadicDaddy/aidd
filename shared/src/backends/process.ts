import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BackendName } from '../plan/types.ts';
import type { AgentEvent, PromptInput } from './types.ts';

import { killProcessTree } from '../lib/processTree.ts';
import { resolveCommand, shouldDetachProcessBackend } from './process-command.ts';

// Re-exported so this module stays the single import surface for running a process backend.
export { resolveCommand, shouldDetachProcessBackend } from './process-command.ts';
import { buildBackendSubprocessEnv } from '../subprocess-env.ts';
import { createPlainBackendParser, finalizePlainBackend } from './parsers/plain.ts';

export interface ProcessBackendOptions {
	args: string[];
	backend: BackendName;
	command: string;
	/**
	 * Rewrite a single stdout/stderr line before it is streamed to the run log, for backends whose
	 * stream carries fields aidd never reads. Setting it switches raw_log from arbitrary decoder
	 * chunks to line-aligned emission (a rewrite needs whole lines), so it costs one line of
	 * latency; the parsed event stream is unaffected. Return the line unchanged to keep it.
	 */
	compactLogLine?: (line: string) => string;
	env?: Record<string, string>;
	finalize?: (input: {
		exitCode: null | number;
		sawAssistantText: boolean;
		sawProviderFlagged?: boolean;
		sawRateLimit: boolean;
		stderr: string;
		stdout: string;
	}) => AgentEvent[];
	parseLine?: (line: string) => AgentEvent[];
	/** When true, the prompt is written to a tempfile passed as `--prompt-file <path>` instead of
	 * piped over stdin. Required for backends (grok) that ignore stdin and only read a prompt from
	 * an argument or file. */
	promptViaFile?: boolean;
}

export async function* runProcessBackend(
	options: ProcessBackendOptions,
	input: PromptInput,
	signal: AbortSignal,
): AsyncIterable<AgentEvent> {
	// One parser instance per run: the plain parser reconciles token usage across the transcript.
	const parseLine = options.parseLine ?? createPlainBackendParser().parseLine;
	const finalize = options.finalize ?? finalizePlainBackend;
	const compactLogLine = options.compactLogLine;

	// Backends that read the prompt from a file (grok) get the prompt written to a tempfile and
	// `--prompt-file <path>` appended; everyone else receives it over stdin. The file is removed
	// once the child exits (or is aborted) below.
	let promptFilePath: string | undefined;
	let spawnArgs = options.args;
	if (options.promptViaFile) {
		promptFilePath = join(tmpdir(), `aidd-prompt-${randomUUID()}.txt`);
		await writeFile(promptFilePath, input.text, 'utf8');
		spawnArgs = [...options.args, '--prompt-file', promptFilePath];
	}

	let child;
	try {
		child = Bun.spawn([resolveCommand(options.command), ...spawnArgs], {
			cwd: input.cwd,
			// On Windows, detached CLI children can open visible console windows and outlive
			// aidd after Ctrl-C/terminal-close. POSIX still detaches to keep the existing
			// process-group isolation behavior there.
			detached: shouldDetachProcessBackend(),
			env: buildBackendSubprocessEnv(options.env),
			stderr: 'pipe',
			stdin: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
	} catch (error) {
		// Bun.spawn throws (not exits) when the backend binary is missing from PATH. The prompt
		// tempfile was already written above, so remove it before the error unwinds — otherwise a
		// missing `grok` binary orphans an aidd-prompt-*.txt in tmp on every attempt.
		if (promptFilePath !== undefined) {
			await rm(promptFilePath, { force: true }).catch(() => {});
		}
		throw error;
	}

	yield { backend: options.backend, pid: child.pid, type: 'started' };

	// With promptViaFile the child gets its prompt from the file, so stdin carries nothing; close
	// it immediately so the child does not block waiting on stdin.
	if (!options.promptViaFile) {
		child.stdin.write(input.text);
	}
	void child.stdin.end();

	const queue: AgentEvent[] = [];
	let resolveWaiter: (() => void) | undefined;
	const wake = (): void => {
		const r = resolveWaiter;
		resolveWaiter = undefined;
		r?.();
	};
	const wait = (): Promise<void> =>
		new Promise<void>((res) => {
			resolveWaiter = res;
		});

	let stdout = '';
	let stderr = '';
	let stdoutBuffer = '';
	let stderrBuffer = '';
	let sawAssistantText = false;
	let sawRateLimit = false;
	let sawProviderFlagged = false;
	let closed = false;
	let exitCode: null | number = null;
	let aborted = false;

	const emit = (event: AgentEvent): void => {
		if (event.type === 'assistant_text') sawAssistantText = true;
		else if (event.type === 'rate_limit') sawRateLimit = true;
		else if (event.type === 'error' && event.reason === 'provider_flagged') {
			sawProviderFlagged = true;
		}
		queue.push(event);
		wake();
	};

	const flushLines = (chunk: string, which: 'stderr' | 'stdout'): void => {
		const buffer = which === 'stdout' ? stdoutBuffer + chunk : stderrBuffer + chunk;
		const newlineIdx = buffer.lastIndexOf('\n');
		if (newlineIdx === -1) {
			if (which === 'stdout') stdoutBuffer = buffer;
			else stderrBuffer = buffer;
			return;
		}
		const complete = buffer.slice(0, newlineIdx);
		const remainder = buffer.slice(newlineIdx + 1);
		if (which === 'stdout') stdoutBuffer = remainder;
		else stderrBuffer = remainder;
		const lines = complete.split(/\r?\n/);
		if (compactLogLine !== undefined) {
			emit({
				chunk: `${lines.map(compactLogLine).join('\n')}\n`,
				stream: which,
				type: 'raw_log',
			});
		}
		for (const line of lines) {
			for (const event of parseLine(line)) emit(event);
		}
	};

	const consumeStream = async (
		stream: ReadableStream<Uint8Array>,
		which: 'stderr' | 'stdout',
	): Promise<void> => {
		const decoder = new TextDecoder('utf-8');
		const reader = stream.getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				const text = decoder.decode(value, { stream: true });
				if (!text) continue;
				if (which === 'stdout') stdout += text;
				else stderr += text;
				// Stream the raw chunk as it arrives so the run log fills incrementally during the
				// run instead of receiving the whole transcript in one burst after exit. The
				// heartbeat run-log writer only persists raw_log for non-native backends, so this
				// is what makes the Live Console show progress mid-run. Backends with a
				// compactLogLine rewrite emit their raw_log from flushLines instead, line-aligned.
				if (compactLogLine === undefined)
					emit({ chunk: text, stream: which, type: 'raw_log' });
				flushLines(text, which);
				wake();
			}
			const tail = decoder.decode();
			if (tail) {
				if (which === 'stdout') stdout += tail;
				else stderr += tail;
				if (compactLogLine === undefined)
					emit({ chunk: tail, stream: which, type: 'raw_log' });
				flushLines(tail, which);
				wake();
			}
		} finally {
			reader.releaseLock();
		}
	};

	const stdoutPromise = consumeStream(child.stdout, 'stdout');
	const stderrPromise = consumeStream(child.stderr, 'stderr');

	const abort = (): void => {
		if (aborted) return;
		aborted = true;
		void killProcessTree(child.pid);
		emit({ meta: signal.reason, reason: 'aborted', type: 'error' });
		closed = true;
		wake();
	};
	signal.addEventListener('abort', abort, { once: true });

	const exitPromise = (async () => {
		const code = await child.exited;
		await Promise.allSettled([stdoutPromise, stderrPromise]);
		exitCode = typeof code === 'number' ? code : null;
		closed = true;
		wake();
	})();

	while (!closed || queue.length > 0) {
		while (queue.length > 0) {
			const event = queue.shift();
			if (event) yield event;
		}
		if (closed) break;
		await Promise.race([wait(), exitPromise]);
	}

	signal.removeEventListener('abort', abort);

	// The child has exited (or been killed on abort) and already read its prompt at startup, so the
	// tempfile is safe to remove. force ignores a missing file; errors are swallowed so cleanup
	// never masks the run result.
	if (promptFilePath !== undefined) {
		await rm(promptFilePath, { force: true }).catch(() => {});
	}

	for (const [remainder, which] of [
		[stdoutBuffer, 'stdout'],
		[stderrBuffer, 'stderr'],
	] as const) {
		if (!remainder) continue;
		// A trailing line with no newline never reached flushLines, so line-aligned backends still
		// owe it to the log. Chunk-aligned backends already streamed it verbatim above.
		if (compactLogLine !== undefined) {
			yield {
				chunk: `${remainder.split(/\r?\n/).map(compactLogLine).join('\n')}\n`,
				stream: which,
				type: 'raw_log',
			};
		}
		for (const line of remainder.split(/\r?\n/)) {
			for (const event of parseLine(line)) {
				if (event.type === 'assistant_text') sawAssistantText = true;
				else if (event.type === 'rate_limit') sawRateLimit = true;
				else if (event.type === 'error' && event.reason === 'provider_flagged') {
					sawProviderFlagged = true;
				}
				yield event;
			}
		}
	}

	// raw_log is streamed incrementally from consumeStream as output arrives, so the full
	// transcript has already been emitted by the time we reach here — do not re-emit it.
	if (aborted) return;

	for (const event of finalize({
		exitCode,
		sawAssistantText,
		sawProviderFlagged,
		sawRateLimit,
		stderr,
		stdout,
	})) {
		yield event;
	}
}

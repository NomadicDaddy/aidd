import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join, resolve, sep } from 'node:path';

import type { BackendName } from '../plan/types.ts';
import type { AgentEvent, PromptInput } from './types.ts';

import { killProcessTree } from '../lib/processTree.ts';
import { buildBackendSubprocessEnv } from '../subprocess-env.ts';
import { finalizePlainBackend, parsePlainBackendLine } from './parsers/plain.ts';

const WIN_PATHEXT_EXTENSIONS = [
	'.COM',
	'.EXE',
	'.BAT',
	'.CMD',
	'.VBS',
	'.VBE',
	'.JS',
	'.JSE',
	'.WSF',
	'.WSH',
	'.MSC',
];

/**
 * Resolve a command for Bun.spawn without shell:true.
 * On non-Windows, returns the command unchanged.
 * On Windows, if the command is absolute or contains a path separator and exists, returns it unchanged.
 * Otherwise, searches PATH entries combined with PATHEXT extensions using synchronous fs checks,
 * falling back to the original command if nothing resolves.
 */
export function resolveCommand(command: string): string {
	if (process.platform !== 'win32') return command;
	if (isAbsolute(command) || command.includes(sep)) {
		return command;
	}
	const pathEnv = process.env.PATH ?? '';
	const pathExt = process.env.PATHEXT ?? '';
	const exts = pathExt ? pathExt.split(';').filter((e) => e.length > 0) : WIN_PATHEXT_EXTENSIONS;
	for (const dir of pathEnv.split(delimiter)) {
		if (!dir) continue;
		for (const ext of exts) {
			const candidate = resolve(dir, command + ext);
			if (existsSync(candidate)) return candidate;
		}
	}
	return command;
}

export function shouldDetachProcessBackend(platform: NodeJS.Platform = process.platform): boolean {
	return platform !== 'win32';
}

export interface ProcessBackendOptions {
	args: string[];
	backend: BackendName;
	command: string;
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
	const parseLine = options.parseLine ?? parsePlainBackendLine;
	const finalize = options.finalize ?? finalizePlainBackend;

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
		for (const line of complete.split(/\r?\n/)) {
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
				// is what makes the Live Console show progress mid-run.
				emit({ chunk: text, stream: which, type: 'raw_log' });
				flushLines(text, which);
				wake();
			}
			const tail = decoder.decode();
			if (tail) {
				if (which === 'stdout') stdout += tail;
				else stderr += tail;
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

	for (const remainder of [stdoutBuffer, stderrBuffer]) {
		if (!remainder) continue;
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

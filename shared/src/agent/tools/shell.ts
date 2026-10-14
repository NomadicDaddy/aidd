import { setTimeout as sleep } from 'node:timers/promises';

import { killProcessTree, stopProcessTree, type TreeStopReport } from '../../lib/processTree.ts';
import { AGENT_MARKER_ENV, buildToolSubprocessEnv } from '../../subprocess-env.ts';
import { augmentEnvPathForGitBash, resolvedBash } from './bash-runtime.ts';
import {
	excludedSearchDirs,
	maxCommandOutputChars,
	maxToolTimeoutMs,
	resolveWorkspacePath,
	truncate,
} from './constants.ts';
import { checkBashWorkspacePolicy } from './shell-policy.ts';

// Default raised from 120s: completion-gate commands (test suites, bun run smoke:qc,
// migrations) routinely exceed two minutes and were dying mid-gate; the idle-kill watchdog
// still bounds a truly hung command. Models can extend per-call via timeout_ms.
const defaultBashTimeoutMs = 300_000;

// Zero, negative and non-finite values made the timer fire at once (with Node's negative and
// overflow warnings), and anything past the ceiling outlived the idle monitor, so a declared
// timeout is refused before spawning unless it is a positive number within the ceiling.
function resolveBashTimeoutMs(value: unknown): number | string {
	if (value === undefined || value === null) return defaultBashTimeoutMs;
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		return 'ERROR: timeout_ms must be a positive, finite number of milliseconds';
	}
	if (value > maxToolTimeoutMs) {
		return `ERROR: timeout_ms must not exceed ${maxToolTimeoutMs}ms`;
	}
	return value;
}

// The loop's signal ends an in-flight subprocess the way the timeout does: the whole tree dies and
// the tool still returns a bounded result naming why, so the transcript records the cancellation.
function abortReason(signal: AbortSignal | undefined): string {
	const reason: unknown = signal?.reason;
	return reason instanceof Error ? reason.message : String(reason);
}

// A cancellation that could not confirm the whole tree is gone says so in the tool result,
// instead of reading as a clean stop while a descendant keeps working.
function incompleteStop(report: TreeStopReport): string {
	if (report.complete) return '';
	if (!report.tableRead) {
		return 'WARNING: cleanup incomplete: the process table could not be read, so child processes may still be running';
	}
	if (report.survivors.length > 0) {
		return `WARNING: cleanup incomplete: still running after the kill: pid ${report.survivors.join(', ')}`;
	}
	return 'WARNING: cleanup incomplete: the command exited before its process tree was read, so child processes it started may still be running';
}

// The diagnostics are what a caller acts on, so the output bound trims the command's own output
// and never the timeout, abort, cleanup or exit-code lines that follow it.
export function formatBashResult(
	output: { stderr: string; stdout: string },
	errors: string[],
	exitCode: number | string,
): string {
	let body = '';
	if (output.stdout) body += output.stdout;
	if (output.stderr) body += `${body ? '\n' : ''}STDERR:\n${output.stderr}`;
	const exitLine = `[exit code: ${exitCode}]`;
	const tailLength = [...errors, exitLine].join('\n').length + 1;
	let result = truncate(
		body,
		Math.max(0, maxCommandOutputChars - tailLength),
		'output truncated at 50000 chars',
	);
	for (const error of errors) result += `${result ? '\n' : ''}${error}`;
	return `${result}\n${exitLine}`;
}

function onAbort(signal: AbortSignal | undefined): {
	aborted: Promise<'aborted'>;
	release: () => void;
} {
	let release = (): void => {};
	const aborted = new Promise<'aborted'>((resolve) => {
		if (!signal) return;
		if (signal.aborted) {
			resolve('aborted');
			return;
		}
		const listener = (): void => resolve('aborted');
		signal.addEventListener('abort', listener, { once: true });
		release = () => signal.removeEventListener('abort', listener);
	});
	return { aborted, release };
}

export async function runBash(
	args: Record<string, unknown>,
	cwd: string,
	signal?: AbortSignal,
): Promise<string> {
	if (typeof args.command !== 'string' || args.command.trim() === '') {
		return 'ERROR: command must be a non-empty string';
	}
	const timeoutMs = resolveBashTimeoutMs(args.timeout_ms);
	if (typeof timeoutMs === 'string') return timeoutMs;
	const command = args.command;
	const bash = resolvedBash();
	if ('error' in bash) return `ERROR: ${bash.error}`;
	const policyError = checkBashWorkspacePolicy(command, cwd);
	if (policyError) return policyError;
	if (signal?.aborted) return `ERROR: Command aborted before it started: ${abortReason(signal)}`;
	const abort = onAbort(signal);
	try {
		const proc = Bun.spawn([bash.path, '-c', command], {
			cwd,
			// PATH is augmented with Git's toolchain dirs: a non-login `bash.exe -c` never
			// self-prepends /usr/bin, so on a stock Windows PATH (Git\cmd only) every coreutil
			// would otherwise exit 127 "command not found".
			// The agent marker is what the repository's pre-push force-push guard reads; the
			// policy above denies the spellings it knows, the hook judges the ref update itself.
			env: augmentEnvPathForGitBash(bash.path, {
				...buildToolSubprocessEnv(),
				[AGENT_MARKER_ENV]: '1',
			}),
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		const stdoutPromise = new Response(proc.stdout).text();
		const stderrPromise = new Response(proc.stderr).text();
		const timeout = sleep(timeoutMs, 'timeout' as const);
		const exitResult = await Promise.race([proc.exited, timeout, abort.aborted]);
		const timedOut = exitResult === 'timeout';
		const aborted = exitResult === 'aborted';

		if (timedOut) {
			// The Windows tree enumeration inside killProcessTree is bounded by this budget and
			// degrades to a root-only kill if the snapshot does not arrive in time; proc.exited
			// resolves as soon as the root dies either way.
			await Promise.race([proc.exited, killProcessTree(proc.pid, 250)]);
		}
		// Cancellation waits for the whole tree instead of racing the root's exit: a descendant
		// left running would keep working after the run reported it stopped.
		const cleanup = aborted ? incompleteStop(await stopProcessTree(proc.pid)) : '';

		// A killed tree can leave a pipe open past its own death; after a cancellation the output
		// is partial anyway, so the stop is not held up a full second waiting for it.
		const readBudgetMs = aborted ? 250 : 1000;
		const [stdout, stderr] = await Promise.all([
			readWithTimeout(stdoutPromise, readBudgetMs),
			readWithTimeout(stderrPromise, readBudgetMs),
		]);

		const errors: string[] = [];
		if (timedOut) errors.push(`ERROR: Command timed out after ${timeoutMs}ms`);
		if (aborted) errors.push(`ERROR: Command aborted: ${abortReason(signal)}`);
		if (cleanup) errors.push(cleanup);
		// The race result is the exit status, 'timeout' or 'aborted': the reported exit code.
		return formatBashResult({ stderr, stdout }, errors, exitResult);
	} catch (error) {
		return `ERROR: Failed to execute command: ${error instanceof Error ? error.message : String(error)}`;
	} finally {
		abort.release();
	}
}

async function readWithTimeout(read: Promise<string>, timeoutMs: number): Promise<string> {
	const result = await Promise.race([read, sleep(timeoutMs, '')]);
	return typeof result === 'string' ? result : '';
}

export async function grepWorkspace(
	args: Record<string, unknown>,
	cwd: string,
	signal?: AbortSignal,
): Promise<string> {
	if (typeof args.pattern !== 'string' || args.pattern.trim() === '') {
		return 'ERROR: pattern must be a non-empty string';
	}
	const resolved = resolveWorkspacePath(args.path ?? '.', cwd);
	if ('error' in resolved) return resolved.error;
	const rgArgs = [
		'rg',
		'--no-heading',
		'--line-number',
		'--max-count',
		'50',
		'--max-filesize',
		'256K',
	];
	for (const dir of excludedSearchDirs) {
		rgArgs.push('--glob', `!${dir}`);
	}
	if (typeof args.include === 'string' && args.include.trim() !== '') {
		rgArgs.push('--glob', args.include);
	}
	rgArgs.push('--', args.pattern, resolved.path);

	if (signal?.aborted) return `ERROR: grep aborted before it started: ${abortReason(signal)}`;
	const abort = onAbort(signal);
	try {
		const proc = Bun.spawn(rgArgs, {
			cwd,
			env: buildToolSubprocessEnv(),
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		const stdoutPromise = new Response(proc.stdout).text();
		const stderrPromise = new Response(proc.stderr).text();
		const exitCode = await Promise.race([proc.exited, abort.aborted]);
		if (exitCode === 'aborted') {
			const cleanup = incompleteStop(await stopProcessTree(proc.pid));
			const message = `ERROR: grep aborted: ${abortReason(signal)}`;
			return cleanup ? `${message}\n${cleanup}` : message;
		}
		const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
		if (exitCode === 1) return 'No matches found.';
		if (exitCode !== 0) return `ERROR: grep failed: ${stderr}`;
		return (
			truncate(stdout.trim(), maxCommandOutputChars, 'output truncated at 50000 chars') ||
			'No matches found.'
		);
	} catch (error) {
		return `ERROR: grep failed: ${error instanceof Error ? error.message : String(error)}`;
	} finally {
		abort.release();
	}
}

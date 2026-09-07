import { setTimeout as sleep } from 'node:timers/promises';

import { killProcessTree } from '../../lib/processTree.ts';
import { buildToolSubprocessEnv } from '../../subprocess-env.ts';
import { augmentEnvPathForGitBash, resolvedBash } from './bash-runtime.ts';
import {
	excludedSearchDirs,
	maxCommandOutputChars,
	resolveWorkspacePath,
	truncate,
} from './constants.ts';
import { checkBashWorkspacePolicy } from './shell-policy.ts';

// Default raised from 120s: completion-gate commands (test suites, bun run smoke:qc,
// migrations) routinely exceed two minutes and were dying mid-gate; the idle-kill watchdog
// still bounds a truly hung command. Models can extend per-call via timeout_ms.
const defaultBashTimeoutMs = 300_000;

export async function runBash(args: Record<string, unknown>, cwd: string): Promise<string> {
	if (typeof args.command !== 'string' || args.command.trim() === '') {
		return 'ERROR: command must be a non-empty string';
	}
	const timeoutMs = typeof args.timeout_ms === 'number' ? args.timeout_ms : defaultBashTimeoutMs;
	const command = args.command;
	const bash = resolvedBash();
	if ('error' in bash) return `ERROR: ${bash.error}`;
	const policyError = checkBashWorkspacePolicy(command, cwd);
	if (policyError) return policyError;
	try {
		const proc = Bun.spawn([bash.path, '-c', command], {
			cwd,
			// PATH is augmented with Git's toolchain dirs: a non-login `bash.exe -c` never
			// self-prepends /usr/bin, so on a stock Windows PATH (Git\cmd only) every coreutil
			// would otherwise exit 127 "command not found".
			env: augmentEnvPathForGitBash(bash.path, buildToolSubprocessEnv()),
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		const stdoutPromise = new Response(proc.stdout).text();
		const stderrPromise = new Response(proc.stderr).text();
		const timeout = sleep(timeoutMs, 'timeout' as const);
		const exitResult = await Promise.race([proc.exited, timeout]);
		const timedOut = exitResult === 'timeout';

		if (timedOut) {
			// The Windows tree enumeration inside killProcessTree is bounded by this budget and
			// degrades to a root-only kill if the snapshot does not arrive in time; proc.exited
			// resolves as soon as the root dies either way.
			await Promise.race([proc.exited, killProcessTree(proc.pid, 250)]);
		}

		const exitCode = timedOut
			? 'timeout'
			: typeof exitResult === 'number'
				? exitResult
				: await proc.exited;
		const [stdout, stderr] = await Promise.all([
			readWithTimeout(stdoutPromise, 1000),
			readWithTimeout(stderrPromise, 1000),
		]);

		let result = '';
		if (stdout) result += stdout;
		if (stderr) result += `${result ? '\n' : ''}STDERR:\n${stderr}`;
		if (timedOut) {
			result += `${result ? '\n' : ''}ERROR: Command timed out after ${timeoutMs}ms`;
		}
		result += `\n[exit code: ${exitCode}]`;
		return truncate(result, maxCommandOutputChars, 'output truncated at 50000 chars');
	} catch (error) {
		return `ERROR: Failed to execute command: ${error instanceof Error ? error.message : String(error)}`;
	}
}

async function readWithTimeout(read: Promise<string>, timeoutMs: number): Promise<string> {
	const result = await Promise.race([read, sleep(timeoutMs, '')]);
	return typeof result === 'string' ? result : '';
}

export async function grepWorkspace(args: Record<string, unknown>, cwd: string): Promise<string> {
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

	try {
		const proc = Bun.spawn(rgArgs, {
			cwd,
			env: buildToolSubprocessEnv(),
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();
		const exitCode = await proc.exited;
		if (exitCode === 1) return 'No matches found.';
		if (exitCode !== 0) return `ERROR: grep failed: ${stderr}`;
		return (
			truncate(stdout.trim(), maxCommandOutputChars, 'output truncated at 50000 chars') ||
			'No matches found.'
		);
	} catch (error) {
		return `ERROR: grep failed: ${error instanceof Error ? error.message : String(error)}`;
	}
}

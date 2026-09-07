import { augmentEnvPathForGitBash, resolvedBash } from 'aidd-shared/agent/tools/bash-runtime';
import { buildToolSubprocessEnv } from 'aidd-shared/subprocess-env';

import type { StepDispatchResult } from './types.ts';

import { pathIsInside } from '../../paths.ts';
import { formatOutputSummary } from './helpers.ts';

// Spawns a bash command and tracks the child process in the session-scoped registry
// so SessionLifecycle.stopSession can kill it. Shared by the shell step handler and
// the hook runner.
export class ShellCommandRunner {
	private readonly activeShellProcesses: Map<string, Set<ReturnType<typeof Bun.spawn>>>;
	private readonly getAllowedRoots: () => readonly string[];

	constructor(input: {
		activeShellProcesses: Map<string, Set<ReturnType<typeof Bun.spawn>>>;
		getAllowedRoots: () => readonly string[];
	}) {
		this.activeShellProcesses = input.activeShellProcesses;
		this.getAllowedRoots = input.getAllowedRoots;
	}

	async run(command: string, cwd: string, sessionId: string): Promise<StepDispatchResult> {
		// Re-applies audit-security-1778849957-recipe-shell-step-cwd-bypasses-allowed-roots:
		// recipe shell-step cwd must stay inside the configured allowed roots. Fail closed
		// before spawning so operator-editable recipe config cannot escape the sandbox.
		const allowedRoots = this.getAllowedRoots();
		if (!allowedRoots.some((root) => pathIsInside(root, cwd))) {
			return { errorMessage: 'Shell step cwd is outside allowed roots', ok: false };
		}
		const bash = resolvedBash();
		if ('error' in bash) return { errorMessage: bash.error, ok: false };

		const childProcess = Bun.spawn([bash.path, '-lc', command], {
			cwd,
			env: augmentEnvPathForGitBash(bash.path, buildToolSubprocessEnv()),
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		});
		const active = this.activeShellProcesses.get(sessionId) ?? new Set();
		active.add(childProcess);
		this.activeShellProcesses.set(sessionId, active);
		const stdoutStream =
			childProcess.stdout instanceof ReadableStream ? childProcess.stdout : null;
		const stderrStream =
			childProcess.stderr instanceof ReadableStream ? childProcess.stderr : null;
		const [stdout, stderr, exitCode] = await Promise.all([
			stdoutStream ? new Response(stdoutStream).text() : Promise.resolve(''),
			stderrStream ? new Response(stderrStream).text() : Promise.resolve(''),
			childProcess.exited,
		]).finally(() => {
			active.delete(childProcess);
			if (active.size === 0) this.activeShellProcesses.delete(sessionId);
		});
		return {
			errorMessage:
				exitCode === 0 ? undefined : stderr.trim() || `Command exited ${exitCode}`,
			exitCode,
			ok: exitCode === 0,
			outputSummary: formatOutputSummary(stdout, stderr),
		};
	}
}

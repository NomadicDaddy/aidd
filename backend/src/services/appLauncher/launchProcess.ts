import { killProcessTree } from 'aidd-shared/lib/processTree';
import { closeSync, mkdtempSync, openSync, readSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { webLogger } from '../../logger.ts';
import { HttpError } from '../errors.ts';
import { type CommandArgs, commandLabel, isPidAlive } from './shared.ts';

const SIGNAL_GRACE_MS = 5000;
/** Bound on captured stdout/stderr kept in memory per launch command (tail only). */
const MAX_CAPTURE_BYTES = 64 * 1024;

export interface CommandResult {
	code: null | number;
	output: string;
	signal: NodeJS.Signals | null;
}

/**
 * Spawn a launched app via Bun.spawn rather than node:child_process.spawn.
 *
 * This is load-bearing on Windows: node:child_process.spawn sets
 * bInheritHandles=TRUE and the web backend's Bun HTTP listen socket is an
 * inheritable handle, so a Node-spawned child inherits the control panel's port
 * binding. The launched app then pins that socket for its entire lifetime — after
 * aidd is killed/restarted the port stays bound to the dead PID and only a reboot
 * frees it. Bun.spawn restricts inherited handles to the configured stdio, so the
 * child never receives the listen socket. Detached lifetime comes from unref()
 * (the child outlives us on POSIX and Windows), matching run/launch.ts.
 * @param command
 * @param cwd
 * @returns The spawned Bun subprocess.
 */
export function spawnCommand(command: CommandArgs, cwd: string): ReturnType<typeof Bun.spawn> {
	return Bun.spawn([...command], {
		cwd,
		stderr: 'ignore',
		stdin: 'ignore',
		stdout: 'ignore',
		windowsHide: true,
	});
}

/**
 * Last `max` non-empty lines of command output, for a human-readable failure summary.
 * @param output
 * @param max
 * @returns The trailing meaningful lines joined by newline.
 */
export function lastMeaningfulLines(output: string, max: number): string {
	const lines = output
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter((line) => line.trim().length > 0);
	return lines.slice(-max).join('\n');
}

interface CommandCapture {
	cleanup: () => void;
	close: () => void;
	outputPath: string;
	stdioFd: number;
}

function createCommandCapture(): CommandCapture {
	const dir = mkdtempSync(join(tmpdir(), 'aidd-app-launcher-'));
	const outputPath = join(dir, 'command-output.log');
	const stdioFd = openSync(outputPath, 'w');
	let closed = false;
	return {
		cleanup: () => {
			try {
				rmSync(dir, { force: true, recursive: true });
			} catch {
				// A launched descendant may briefly inherit the output file on Windows.
			}
		},
		close: () => {
			if (closed) return;
			closed = true;
			closeSync(stdioFd);
		},
		outputPath,
		stdioFd,
	};
}

function readOutputTail(path: string): string {
	try {
		const { size } = statSync(path);
		if (size === 0) return '';
		const fd = openSync(path, 'r');
		try {
			const length = Math.min(size, MAX_CAPTURE_BYTES);
			const buffer = Buffer.alloc(length);
			readSync(fd, buffer, 0, length, size - length);
			return buffer.toString('utf8');
		} finally {
			closeSync(fd);
		}
	} catch {
		return '';
	}
}

export async function runProjectCommand(
	projectPath: string,
	command: CommandArgs,
): Promise<CommandResult> {
	let capture: CommandCapture | null = null;
	try {
		capture = createCommandCapture();
		const child = Bun.spawn([...command], {
			cwd: projectPath,
			stderr: capture.stdioFd,
			stdin: 'ignore',
			stdout: capture.stdioFd,
			windowsHide: true,
		});
		capture.close();
		const code = await child.exited;
		return { code, output: readOutputTail(capture.outputPath), signal: child.signalCode };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new HttpError(`Failed to spawn command "${commandLabel(command)}": ${message}`, 500);
	} finally {
		capture?.close();
		capture?.cleanup();
	}
}

export async function runStopCommand(projectPath: string, command: CommandArgs): Promise<boolean> {
	const result = await runProjectCommand(projectPath, command);
	if (result.code === 0) return true;
	webLogger.warn(
		{
			code: result.code,
			command: commandLabel(command),
			output: result.output,
			projectPath,
			signal: result.signal,
		},
		'app launcher stop command failed; falling back to process signals',
	);
	return false;
}

export async function stopTrackedPid(pid: number): Promise<void> {
	if (pid === process.pid) {
		webLogger.error({ pid }, 'app launcher refused to signal own pid');
		return;
	}
	try {
		process.kill(pid, 'SIGINT');
	} catch {
		// already exited
	}
	await sleep(SIGNAL_GRACE_MS);
	if (!isPidAlive(pid)) return;
	try {
		process.kill(pid, 'SIGTERM');
	} catch {
		// already exited
	}
	await sleep(SIGNAL_GRACE_MS);
	if (isPidAlive(pid)) {
		await killProcessTree(pid);
	}
}

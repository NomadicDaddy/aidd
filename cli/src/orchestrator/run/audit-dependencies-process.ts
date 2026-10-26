import { ChildProcessReaper } from 'aidd-shared/lib/childProcessReaper';
import { isProcessAlive, stopProcessTree } from 'aidd-shared/lib/processTree';
import { buildProjectCommandEnv } from 'aidd-shared/subprocess-env';
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

import {
	type AuditInstallResult,
	type AuditSetupEvidence,
	type AuditSetupOutput,
	openAuditSetupOutput,
} from './audit-dependencies-evidence.ts';

type ExitResult = Pick<AuditInstallResult, 'error' | 'exitCode' | 'status'>;

function installExit(child: ChildProcess): Promise<ExitResult> {
	return new Promise((resolve) => {
		child.once('error', (error) =>
			resolve({ error: error.message, exitCode: null, status: 'failed' }),
		);
		child.once('exit', (exitCode) =>
			resolve({
				exitCode,
				status: exitCode === 0 ? 'complete' : 'failed',
			}),
		);
	});
}

function startInstall(evidence: AuditSetupEvidence, outputs: AuditSetupOutput[]) {
	const child = spawn(evidence.command[0]!, evidence.command.slice(1), {
		cwd: evidence.cwd,
		env: { ...buildProjectCommandEnv(), NODE_ENV: 'development' },
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true,
	});
	const exited = installExit(child);
	const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
	child.stdout?.on('data', (chunk: Buffer) => outputs[0]!.write(chunk));
	child.stderr?.on('data', (chunk: Buffer) => outputs[1]!.write(chunk));
	const reaper = new ChildProcessReaper();
	if (child.pid !== undefined) reaper.attach(child.pid);
	return { child, closed, exited, reaper };
}

function watchSetup(timeoutMs: number, stopFiles: string[]) {
	let timeout: ReturnType<typeof setTimeout>;
	let interval: ReturnType<typeof setInterval>;
	const interrupted = new Promise<ExitResult>((resolve) => {
		timeout = setTimeout(() => resolve({ exitCode: null, status: 'timeout' }), timeoutMs);
		interval = setInterval(() => {
			if (stopFiles.some((file) => existsSync(file)))
				resolve({ exitCode: null, status: 'stopped' });
		}, 100);
	});
	return {
		dispose: (): void => {
			clearTimeout(timeout);
			clearInterval(interval);
		},
		interrupted,
	};
}

async function drainClosed(closed: Promise<void>): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			closed.then(() => true),
			new Promise<false>((resolve) => {
				timer = setTimeout(() => resolve(false), 1000);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

async function cleanupInstall(
	running: ReturnType<typeof startInstall>,
	result: ExitResult,
): Promise<boolean> {
	const { child, reaper } = running;
	let confirmed = true;
	try {
		if (result.status === 'timeout' || result.status === 'stopped') {
			confirmed = child.pid !== undefined && (await stopProcessTree(child.pid)).complete;
		}
		await reaper.reap();
	} catch {
		confirmed = false;
	} finally {
		reaper.stop();
	}
	return confirmed;
}

function destroyInstallStreams(child: ChildProcess): void {
	child.stdout?.destroy();
	child.stderr?.destroy();
}

async function finishInstall(
	running: ReturnType<typeof startInstall>,
	result: ExitResult,
): Promise<AuditInstallResult> {
	const { child, reaper } = running;
	const confirmed = await cleanupInstall(running, result);
	const pids = child.pid === undefined ? [] : [child.pid, ...reaper.trackedPids()];
	const survivors = pids.filter(isProcessAlive);
	const drained = await drainClosed(running.closed);
	destroyInstallStreams(child);
	return {
		...result,
		cleanupComplete: confirmed && survivors.length === 0 && drained,
		exitCode: child.exitCode,
		...(child.pid === undefined ? {} : { pid: child.pid }),
		...(child.signalCode ? { signal: child.signalCode } : {}),
		survivors,
	};
}

async function executeInstall(
	evidence: AuditSetupEvidence,
	outputs: AuditSetupOutput[],
	deadlineAtMs: number,
	stopFiles: string[],
): Promise<AuditInstallResult> {
	evidence.installTimeoutMs = deadlineAtMs - Date.now();
	if (evidence.installTimeoutMs <= 0)
		return { cleanupComplete: true, exitCode: null, status: 'timeout' };
	const running = startInstall(evidence, outputs);
	const watcher = watchSetup(Math.max(1, deadlineAtMs - Date.now()), stopFiles);
	let result: ExitResult;
	try {
		result = await Promise.race([running.exited, watcher.interrupted]);
	} finally {
		watcher.dispose();
	}
	return await finishInstall(running, result);
}

export async function runAuditDependencyInstall(
	evidence: AuditSetupEvidence,
	deadlineAtMs: number,
	stopFiles: string[],
): Promise<AuditInstallResult> {
	const stdout = await openAuditSetupOutput(evidence.stdoutPath);
	try {
		const stderr = await openAuditSetupOutput(evidence.stderrPath);
		try {
			return await executeInstall(evidence, [stdout, stderr], deadlineAtMs, stopFiles);
		} finally {
			await stderr.close();
		}
	} finally {
		await stdout.close();
	}
}

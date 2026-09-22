import { describe, expect, test } from 'bun:test';

import {
	captureDescendants,
	isProcessAlive,
	killCapturedDescendants,
	killProcessTree,
} from '../../shared/src/lib/processTree.ts';
import { listProcessTable } from '../../shared/src/lib/processTable.ts';

import { pollFor } from '../_helpers/leaky-server-fixture.ts';

// The app launcher signals the process it started and nothing else: `bun run dev` dies and the
// Vite server it spawned keeps the port, because a launch script starts its servers detached so
// they outlive the shell. The tree is captured before the signal rather than after: on POSIX an
// orphan reparents to init immediately, and on Windows the dead parent's number is reported on its
// orphans until the system reissues it, after which enumeration from it is answering about someone
// else entirely.

/**
 * A parent that spawns a detached child and reports its pid.
 *
 * Detached is the shape that leaks: a launch script starts its servers that way on purpose, so
 * they outlive the shell that started them, and killing the parent alone leaves them running. A
 * plain child shares the parent's job on Windows and dies with it, which would test nothing.
 */
async function parentThatLeaves(): Promise<{ childPid: number; parentPid: number }> {
	const script =
		'const { spawn } = require("node:child_process"); ' +
		'const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], ' +
		'{ detached: true, stdio: "ignore", windowsHide: true }); ' +
		'child.unref(); console.log(child.pid); setTimeout(() => {}, 60000);';
	const parent = Bun.spawn([process.execPath, '-e', script], {
		stderr: 'ignore',
		stdin: 'ignore',
		stdout: 'pipe',
		windowsHide: true,
	});
	const reader = parent.stdout.getReader();
	const { value } = await reader.read();
	reader.releaseLock();
	const childPid = Number(new TextDecoder().decode(value).trim());
	expect(childPid).toBeGreaterThan(0);
	return { childPid, parentPid: parent.pid as number };
}

async function gone(pid: number): Promise<string | undefined> {
	return await pollFor(() => Promise.resolve(isProcessAlive(pid) ? undefined : 'gone'), 5_000);
}

describe('captured descendants', () => {
	test('sweeps the child a dead parent left behind', async () => {
		const { childPid, parentPid } = await parentThatLeaves();
		try {
			const captured = await captureDescendants(parentPid);
			expect(captured.map((entry) => entry.pid)).toContain(childPid);

			// Only the parent, exactly as a signal to a launch command does it: killProcessTree
			// would take the whole tree and there would be nothing left to sweep.
			process.kill(parentPid, 'SIGKILL');
			expect(await gone(parentPid)).toBe('gone');
			expect(isProcessAlive(childPid)).toBe(true);

			expect(await killCapturedDescendants(captured)).toBeGreaterThan(0);
			expect(await gone(childPid)).toBe('gone');
		} finally {
			await killProcessTree(parentPid);
			await killProcessTree(childPid);
		}
	});

	test('skips a number the system has handed to someone else', async () => {
		const { childPid, parentPid } = await parentThatLeaves();
		try {
			const live = (await listProcessTable())?.find((entry) => entry.pid === childPid);

			await killCapturedDescendants([{ pid: childPid, startId: 'captured-start-token' }]);

			if (live?.startId === undefined) {
				// No token to compare on this platform: the snapshot is the only evidence there is,
				// and the sweep acts on it.
				expect(await gone(childPid)).toBe('gone');
			} else {
				// The live token disagrees, so this pid is a different process now. Leave it alone.
				expect(isProcessAlive(childPid)).toBe(true);
			}
		} finally {
			await killProcessTree(parentPid);
			await killProcessTree(childPid);
		}
	});

	test('kills nothing when the captured processes are already gone', async () => {
		const { childPid, parentPid } = await parentThatLeaves();
		const captured = await captureDescendants(parentPid);
		process.kill(parentPid, 'SIGKILL');
		await killProcessTree(childPid);
		expect(await gone(childPid)).toBe('gone');

		expect(await killCapturedDescendants(captured)).toBe(0);
	});
});

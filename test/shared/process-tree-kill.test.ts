import { describe, expect, test } from 'bun:test';

import { isProcessAlive, killProcessTree } from '../../shared/src/lib/processTree.ts';

import { pollFor } from '../_helpers/leaky-server-fixture.ts';

// killProcessTree is deliberately not `taskkill /T` on Windows, which walks ParentProcessId with no
// notion of identity — and Windows keeps reporting a dead parent's number on its orphans while
// freely reissuing that number. A `/T` aimed at a reissued pid therefore cascades into an unrelated
// tree, which is how a teardown kill aimed at a leaked child can take down the run issuing it.
// killProcessTree enumerates the tree itself, so the property it must have is this one: killing
// a parent kills the children it really has.
describe('killProcessTree', () => {
	test('kills a grandchild, not just the process named', async () => {
		// The child spawns a sleeper and reports its pid, then sleeps itself: two live generations
		// below this process, with only the top one named in the kill.
		const script =
			'const child = Bun.spawn([process.execPath, "-e", "await Bun.sleep(60000)"], ' +
			'{ stdin: "ignore", stdout: "ignore", stderr: "ignore" }); ' +
			'console.log(child.pid); await Bun.sleep(60000);';
		const parent = Bun.spawn([process.execPath, '-e', script], {
			stderr: 'ignore',
			stdin: 'ignore',
			stdout: 'pipe',
			windowsHide: true,
		});

		let grandchildPid = 0;
		try {
			const reader = parent.stdout.getReader();
			const { value } = await reader.read();
			grandchildPid = Number(new TextDecoder().decode(value).trim());
			reader.releaseLock();
			expect(grandchildPid).toBeGreaterThan(0);
			expect(isProcessAlive(grandchildPid)).toBe(true);

			await killProcessTree(parent.pid);

			expect(isProcessAlive(parent.pid as number)).toBe(false);
			// The kill returns once the named process is gone; the rest of the tree lands with it,
			// but the liveness probe can lag the OS by a scheduling quantum.
			expect(
				await pollFor(
					() => Promise.resolve(isProcessAlive(grandchildPid) ? undefined : 'gone'),
					5_000,
				),
			).toBe('gone');
		} finally {
			await killProcessTree(parent.pid);
			if (grandchildPid > 0) await killProcessTree(grandchildPid);
		}
	});

	test('refuses to kill the calling process', async () => {
		await killProcessTree(process.pid);
		expect(isProcessAlive(process.pid)).toBe(true);
	});
});

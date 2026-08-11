import { describe, expect, test } from 'bun:test';

import { listProcessTableNative } from '../../shared/src/lib/processTableWin.ts';
import { killProcessTree } from '../../shared/src/lib/processTree.ts';

// The native Toolhelp probe is the reason the reaper works at all on Windows: the PowerShell/WMI
// fallback costs 3-4s, and a backend that spawns its children and exits inside that window is
// gone before its row is ever captured — so nothing is tracked and nothing is reaped.
const windowsOnly = process.platform === 'win32' ? describe : describe.skip;

windowsOnly('listProcessTableNative', () => {
	test('reports this process with its real parent and a start-time token', async () => {
		const table = await listProcessTableNative();
		expect(table).not.toBeNull();

		const self = table?.find((entry) => entry.pid === process.pid);
		expect(self).toBeDefined();
		expect(self?.ppid).toBeGreaterThan(0);
		// Our own process is always openable, so its creation time is always readable.
		expect(self?.startId).toBeDefined();
	});

	test('links a spawned child to this process', async () => {
		const child = Bun.spawn([process.execPath, '-e', 'await Bun.sleep(15000)'], {
			stderr: 'ignore',
			stdin: 'ignore',
			stdout: 'ignore',
			windowsHide: true,
		});
		try {
			const table = await listProcessTableNative();
			const row = table?.find((entry) => entry.pid === child.pid);
			expect(row).toBeDefined();
			expect(row?.ppid).toBe(process.pid);
		} finally {
			await killProcessTree(child.pid);
		}
	});

	test('is fast enough to snapshot a short-lived process before it exits', async () => {
		// The property that matters. The WMI probe took 3-4s, which is longer than a backend that
		// starts its server and exits — by the time the table arrived, the root was gone.
		//
		// Measured as the best of several samples, not a single one. A single sample times the
		// scheduler as much as the probe: under the parallel suite this call has been preempted
		// into 5s, which says nothing about whether the probe is the fast one. The minimum is what
		// the probe costs when it gets the CPU, and that is the claim being made here. It does not
		// soften the test — the WMI fallback this bound exists to exclude is 3-4s on every sample,
		// so no minimum of it lands under the bound.
		let fastestMs = Number.POSITIVE_INFINITY;
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const startedAt = Date.now();
			const table = await listProcessTableNative();
			fastestMs = Math.min(fastestMs, Date.now() - startedAt);
			expect(table?.length).toBeGreaterThan(0);
		}

		expect(fastestMs).toBeLessThan(1_500);
	});

	test('tolerates processes it cannot open: they keep pid/ppid, only the token is absent', async () => {
		const table = await listProcessTableNative();
		expect(table).not.toBeNull();

		// System processes refuse OpenProcess. That must not drop their rows or fail the table:
		// the descendant walk needs every ppid link, token or not.
		for (const entry of table ?? []) {
			expect(Number.isInteger(entry.pid)).toBe(true);
			expect(Number.isInteger(entry.ppid)).toBe(true);
		}
		expect((table ?? []).some((entry) => entry.startId === undefined)).toBe(true);
		expect((table ?? []).some((entry) => entry.startId !== undefined)).toBe(true);
	});
});

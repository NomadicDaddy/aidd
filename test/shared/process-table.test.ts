import { describe, expect, test } from 'bun:test';

import { listProcessTable, readProcessEntry } from '../../shared/src/lib/processTable.ts';

// The reaper's identity checks (linkIsSound, confirmLiveIdentity) compare start-time tokens from
// BOTH sources: the root's row is recorded via readProcessEntry, snapshots via listProcessTable.
// Any format difference between them reads as a recycled pid, which silently untracks every child
// of the root — on Linux that meant /proc's `proc:<ticks>` never matched ps's lstart date string,
// so no leak was ever reaped on CI. This pins the invariant: one platform, one token format.
describe('process table identity tokens', () => {
	test('single-pid read and table scan agree on our own row', async () => {
		const [entry, table] = await Promise.all([
			readProcessEntry(process.pid),
			listProcessTable(),
		]);
		expect(entry).not.toBeNull();
		expect(table).not.toBeNull();

		const self = table?.find((row) => row.pid === process.pid);
		expect(self).toBeDefined();
		expect(self?.ppid).toBe(entry?.ppid as number);
		// Tokens must be comparable across sources; equal is the only comparable.
		expect(self?.startId).toBe(entry?.startId as string);
	});
});

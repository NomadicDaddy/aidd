import { describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { reclaimStaleLease } from 'aidd-shared/metadata/feature-leases';

import { testTempDir } from '../_helpers/temp.ts';

// Direct interleaving tests for the quarantine-verify step. The window they exercise — the
// lease file changing between a contender's read and its rename — cannot be driven
// deterministically through the public acquire path, which is why reclaimStaleLease is exported.

function leaseRaw(runId: string, pid: number): string {
	return `${JSON.stringify(
		{ acquiredAt: '2026-07-22T00:00:00.000Z', featureId: 'feat-x', pid, runId },
		null,
		'\t',
	)}\n`;
}

async function leaseFixture(name: string, content: null | string): Promise<string> {
	const dir = await testTempDir(`lease-reclaim-${name}`);
	await mkdir(dir, { recursive: true });
	const path = join(dir, 'feat-x.json');
	if (content !== null) await writeFile(path, content);
	return path;
}

describe('reclaimStaleLease', () => {
	test('removes the lease when the quarantined bytes match the classification', async () => {
		const staleRaw = leaseRaw('run_dead', 4999999);
		const path = await leaseFixture('match', staleRaw);
		const result = await reclaimStaleLease(path, staleRaw, `${path}.stale-1-0`);
		expect(result.outcome).toBe('reclaimed');
		expect(await readFile(path, 'utf8').catch(() => null)).toBeNull();
		expect(await readFile(`${path}.stale-1-0`, 'utf8').catch(() => null)).toBeNull();
	});

	test('restores and reports a live lease that raced into the pathname', async () => {
		// Classified content (the dead holder) differs from what now occupies the path: another
		// run released/reclaimed the stale lease and acquired between our read and rename.
		const staleRaw = leaseRaw('run_dead', 4999999);
		const liveRaw = leaseRaw('run_live', process.pid);
		const path = await leaseFixture('displaced', liveRaw);
		const result = await reclaimStaleLease(path, staleRaw, `${path}.stale-1-0`);
		expect(result.outcome).toBe('displaced_live_lease');
		if (result.outcome === 'displaced_live_lease') {
			expect(result.holder?.runId).toBe('run_live');
		}
		// The live lease is back in place, byte-identical; the quarantine file is gone.
		expect(await readFile(path, 'utf8')).toBe(liveRaw);
		expect(await readFile(`${path}.stale-1-0`, 'utf8').catch(() => null)).toBeNull();
	});

	test('reports rename_failed when another contender already quarantined the lease', async () => {
		const staleRaw = leaseRaw('run_dead', 4999999);
		const path = await leaseFixture('gone', null);
		const result = await reclaimStaleLease(path, staleRaw, `${path}.stale-1-0`);
		expect(result.outcome).toBe('rename_failed');
	});
});

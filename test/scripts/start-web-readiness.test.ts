import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { recordedBackendPid, waitForOwnBackend } from '../../scripts/lib/start-web/readiness.ts';
import { stopBlocksStart } from '../../scripts/start-web.ts';

import { testTempDir } from '../_helpers/temp.ts';

const temps: string[] = [];
afterEach(async () => {
	for (const dir of temps.splice(0)) await removeTempTree(dir);
});

describe('start-web stop result', () => {
	test('starts only after stop:web exits 0', () => {
		expect(stopBlocksStart(0)).toBe(false);
		// 2: stop-web refused to force-kill, or found an orphaned or foreign listener.
		expect(stopBlocksStart(1)).toBe(true);
		expect(stopBlocksStart(2)).toBe(true);
		// null: stop-web itself was killed by a signal.
		expect(stopBlocksStart(null)).toBe(true);
	});
});

describe('start-web readiness', () => {
	const portOpen = () => Promise.resolve(true);

	test('an old backend answering the port is not the new one', async () => {
		const outcome = await waitForOwnBackend(
			100,
			{ exitCode: () => null, portOpen, recordedPid: () => 99 },
			50,
			10,
		);
		expect(outcome).toBe('timeout');
	});

	test('ready once the spawned backend has recorded its own pid and the port answers', async () => {
		const outcome = await waitForOwnBackend(
			100,
			{ exitCode: () => null, portOpen, recordedPid: () => 100 },
			1_000,
			10,
		);
		expect(outcome).toBe('ready');
	});

	test('reports a spawned backend that exits instead of waiting out the timeout', async () => {
		const started = Date.now();
		const outcome = await waitForOwnBackend(
			100,
			{ exitCode: () => 1, portOpen, recordedPid: () => 99 },
			30_000,
			10,
		);
		expect(outcome).toBe('exited');
		expect(Date.now() - started).toBeLessThan(1_000);
	});

	test('reads the recorded pid without ever deleting a half-written file', async () => {
		const logs = await testTempDir('aidd-start-web-ready-');
		temps.push(logs);
		const path = join(logs, 'backend.pid');
		await writeFile(path, '{"pid":12', 'utf8');
		expect(recordedBackendPid(logs)).toBeNull();
		expect(existsSync(path)).toBe(true);
		await writeFile(path, '{"pid":1234,"startId":"x"}\n', 'utf8');
		expect(recordedBackendPid(logs)).toBe(1234);
	});
});

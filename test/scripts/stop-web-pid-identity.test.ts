import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readProcessEntry } from '../../shared/src/lib/processTable.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import {
	isProcessAlive,
	readPidFile,
	stopPidFileProcess,
} from '../../scripts/lib/stop-web/process-control.ts';

import { testTempDir } from '../_helpers/temp.ts';

// A stale logs/backend.pid can name a pid that Windows has since given to an unrelated process.
// stop:web --force must leave that process alone and only stop the backend the file recorded.
const sleepers: { kill: () => void }[] = [];
const temps: string[] = [];

afterEach(async () => {
	for (const sleeper of sleepers.splice(0)) sleeper.kill();
	for (const dir of temps.splice(0)) await removeTempTree(dir);
});

function spawnSleeper(): number {
	const proc = Bun.spawn([process.execPath, '-e', 'await Bun.sleep(60_000)'], {
		stdout: 'ignore',
		stderr: 'ignore',
		windowsHide: true,
	});
	sleepers.push(proc);
	return proc.pid;
}

async function logsWith(content: string): Promise<string> {
	const dir = await testTempDir('aidd-stop-web-pid-');
	temps.push(dir);
	await writeFile(join(dir, 'backend.pid'), content, 'utf8');
	return dir;
}

function quietly<T>(run: () => Promise<T>): Promise<T> {
	const original = console.log;
	console.log = () => {};
	return run().finally(() => {
		console.log = original;
	});
}

describe('stop-web pid identity', () => {
	test('leaves a live process alone when its start time is not the recorded one', async () => {
		const pid = spawnSleeper();
		const logs = await logsWith(JSON.stringify({ pid, startId: 'recorded-backend' }));
		const stopped = await quietly(() =>
			stopPidFileProcess(logs, 3210, () =>
				Promise.resolve({ pid, ppid: 0, startId: 'someone-else' }),
			),
		);
		expect(stopped).toBe(false);
		expect(isProcessAlive(pid)).toBe(true);
		expect(existsSync(join(logs, 'backend.pid'))).toBe(false);
	});

	test('refuses a record with no start time, since it cannot prove identity', async () => {
		const pid = spawnSleeper();
		const logs = await logsWith(JSON.stringify({ pid }));
		const stopped = await quietly(() =>
			stopPidFileProcess(logs, 3210, () => Promise.resolve({ pid, ppid: 0, startId: 'x' })),
		);
		expect(stopped).toBe(false);
		expect(isProcessAlive(pid)).toBe(true);
	});

	test('stops the recorded backend when its start time matches', async () => {
		const pid = spawnSleeper();
		const entry = await readProcessEntry(pid);
		expect(entry?.startId).toBeDefined();
		const logs = await logsWith(JSON.stringify({ pid, startId: entry?.startId }));
		const stopped = await quietly(() => stopPidFileProcess(logs, 3210));
		expect(stopped).toBe(true);
		for (let i = 0; i < 40 && isProcessAlive(pid); i++) await Bun.sleep(50);
		expect(isProcessAlive(pid)).toBe(false);
		expect(existsSync(join(logs, 'backend.pid'))).toBe(false);
	});

	test('treats a bare-number pid file as unreadable and removes it', async () => {
		const pid = spawnSleeper();
		const logs = await logsWith(`${pid}\n`);
		expect(readPidFile(logs)).toBeNull();
		expect(existsSync(join(logs, 'backend.pid'))).toBe(false);
		expect(isProcessAlive(pid)).toBe(true);
	});
});

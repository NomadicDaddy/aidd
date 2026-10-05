import { afterEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';

import { killRun, stopRun } from '../../backend/src/services/run/control.ts';
import { readProcessEntry } from '../../shared/src/lib/processTable.ts';
import { isProcessAlive } from '../../shared/src/lib/processTree.ts';
import {
	createCliActiveRunRecord,
	writeCliActiveRunRecord,
} from '../../shared/src/metadata/active-runs.ts';
import { runStopFilePath } from '../../shared/src/metadata/paths.ts';
import { controlFixture } from './_helpers/control-fixture.ts';

// A run whose CLI keeps working but cannot write its heartbeat (antivirus EBUSY, a full disk, a
// starved event loop) looks stale while its pid is live. Stop used to call that dead: it marked the
// row stopped and deleted the stop request, and the run kept editing the repository with nothing
// able to stop it. Kill skipped the kill the same way. The recorded start time now tells this run
// apart from a pid that merely got reused, which is the case the old rule was protecting against.

const RUN = 'stale_alive';
const sleepers: { kill: () => void }[] = [];

afterEach(() => {
	for (const sleeper of sleepers.splice(0)) sleeper.kill();
});

function spawnSleeper(): number {
	const proc = Bun.spawn([process.execPath, '-e', 'await Bun.sleep(60_000)'], {
		stderr: 'ignore',
		stdout: 'ignore',
		windowsHide: true,
	});
	sleepers.push(proc);
	return proc.pid;
}

async function staleHeartbeat(projectPath: string, pid: number, pidStartId: string): Promise<void> {
	const tenMinutesAgo = Date.now() - 10 * 60_000;
	await writeCliActiveRunRecord({
		...createCliActiveRunRecord({
			backend: 'codex',
			id: RUN,
			mode: 'coding',
			model: undefined,
			projectDir: projectPath,
			provider: undefined,
			reasoningEffort: 'low',
			source: 'web',
		}),
		heartbeatAt: tenMinutesAgo,
		pid,
		pidStartId,
		startedAt: tenMinutesAgo,
		state: 'running',
	});
}

test('stop on a live run with a stale heartbeat keeps the row running and the stop request', async () => {
	const pid = spawnSleeper();
	const startId = (await readProcessEntry(pid))?.startId;
	expect(startId).toBeDefined();
	const fixture = await controlFixture(RUN, Date.now() - 10 * 60_000);
	try {
		await staleHeartbeat(fixture.projectPath, pid, startId ?? '');
		await stopRun(fixture.ctx, RUN);

		expect(fixture.status()).toEqual({ status: 'running' });
		expect(existsSync(runStopFilePath(fixture.projectPath, RUN))).toBe(true);
	} finally {
		await fixture.cleanup();
	}
});

test('kill on a live run with a stale heartbeat really kills it', async () => {
	const pid = spawnSleeper();
	const startId = (await readProcessEntry(pid))?.startId;
	const fixture = await controlFixture(RUN, Date.now() - 10 * 60_000);
	try {
		await staleHeartbeat(fixture.projectPath, pid, startId ?? '');
		await killRun(fixture.ctx, RUN);

		for (let i = 0; i < 40 && isProcessAlive(pid); i++) await Bun.sleep(50);
		expect(isProcessAlive(pid)).toBe(false);
	} finally {
		await fixture.cleanup();
	}
});

test('a reused pid (different start time) is never signalled, and the row ends', async () => {
	const pid = spawnSleeper();
	const fixture = await controlFixture(RUN, Date.now() - 10 * 60_000);
	try {
		await staleHeartbeat(fixture.projectPath, pid, 'some-other-process');
		await killRun(fixture.ctx, RUN);

		expect(fixture.status()).toEqual({ status: 'killed' });
		expect(isProcessAlive(pid)).toBe(true);
	} finally {
		await fixture.cleanup();
	}
});

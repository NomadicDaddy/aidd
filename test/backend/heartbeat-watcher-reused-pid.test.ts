import { afterEach, expect, test } from 'bun:test';

import type { HeartbeatWatcherContext } from '../../backend/src/services/run/heartbeatWatcherTypes.ts';
import type { QueriesContext } from '../../backend/src/services/run/queryContracts.ts';

import { reconcileStaleRuns } from '../../backend/src/services/run/activeRunReconcile.ts';
import { HeartbeatWatcher } from '../../backend/src/services/run/heartbeatWatcher.ts';
import { readProcessEntry } from '../../shared/src/lib/processTable.ts';
import {
	createCliActiveRunRecord,
	writeCliActiveRunRecord,
} from '../../shared/src/metadata/active-runs.ts';
import { controlFixture } from './_helpers/control-fixture.ts';

// A run that died hard (killed from Task Manager, power loss) writes no terminal heartbeat. Once
// Windows hands its pid to another process, the pid reads alive, the watcher used to leave the row
// running forever, and that row held a ceiling slot that queued runs waited on. The recorded start
// time tells the two apart; a sleeping laptop (same process, stale clock) must still be spared.

const RUN = 'reused_pid';
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

type Examiner = 'boot' | 'watcher';

async function examineStaleRun(
	pidStartId: string,
	examiner: Examiner = 'watcher',
): Promise<unknown> {
	const pid = spawnSleeper();
	const tenMinutesAgo = Date.now() - 10 * 60_000;
	const fixture = await controlFixture(RUN, tenMinutesAgo);
	try {
		await writeCliActiveRunRecord({
			...createCliActiveRunRecord({
				backend: 'codex',
				id: RUN,
				mode: 'coding',
				model: undefined,
				projectDir: fixture.projectPath,
				provider: undefined,
				reasoningEffort: 'low',
				source: 'web',
			}),
			heartbeatAt: tenMinutesAgo,
			pid,
			pidStartId:
				pidStartId === 'own' ? ((await readProcessEntry(pid))?.startId ?? '') : pidStartId,
			startedAt: tenMinutesAgo,
			state: 'running',
		});
		if (examiner === 'boot') {
			await reconcileStaleRuns(fixture.ctx as unknown as QueriesContext);
		} else {
			const watcher = await HeartbeatWatcher.start(
				fixture.projectPath,
				fixture.ctx as unknown as HeartbeatWatcherContext,
			);
			await watcher.stop();
		}
		return fixture.status();
	} finally {
		await fixture.cleanup();
	}
}

test.each(['watcher', 'boot'] as const)(
	'%s: a stale run whose pid now belongs to another process is reaped',
	async (examiner) => {
		expect(await examineStaleRun('some-other-process', examiner)).toEqual({ status: 'failed' });
	},
);

test.each(['watcher', 'boot'] as const)(
	'%s: a stale run whose pid is still its own process is left running',
	async (examiner) => {
		expect(await examineStaleRun('own', examiner)).toEqual({ status: 'running' });
	},
);

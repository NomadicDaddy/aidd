import { describe, expect, test } from 'bun:test';

import type {
	AppLaunchRecord,
	AppLaunchStatus,
} from '../../backend/src/services/appLauncher/shared.ts';

import { encodeProjectId } from '../../backend/src/paths.ts';
import { AppWatchdog } from '../../backend/src/services/appLauncher/watchdog.ts';

const projectPath = 'D:/applications/example-app';

function record(status: AppLaunchStatus): AppLaunchRecord {
	return {
		command: 'bun run start',
		pid: status === 'running' ? 4242 : null,
		projectPath,
		startedAt: 1,
		status,
	} as AppLaunchRecord;
}

/** A launcher stand-in whose status is scripted per call and whose starts are recorded. */
function fakeLauncher(statuses: AppLaunchStatus[], options: { failStart?: boolean } = {}) {
	const starts: string[] = [];
	let index = 0;
	return {
		starts,
		launcher: {
			async getStatus(): Promise<AppLaunchRecord> {
				const status = statuses[Math.min(index++, statuses.length - 1)] ?? 'stopped';
				return record(status);
			},
			async start(projectId: string): Promise<AppLaunchRecord> {
				starts.push(projectId);
				if (options.failStart) throw new Error('launch refused');
				return record('running');
			},
		},
	};
}

describe('AppWatchdog', () => {
	test('restarts an app that crashes while a session is supervising it', async () => {
		const { launcher, starts } = fakeLauncher(['running', 'crashed']);
		const watchdog = new AppWatchdog({ launcher });
		await watchdog.watch(projectPath);
		expect(starts).toEqual([]);
		await watchdog.tick();
		expect(starts).toHaveLength(1);
		watchdog.unwatch(projectPath);
	});

	test('restarts a crashed app up front so the first step has something to verify against', async () => {
		const { launcher, starts } = fakeLauncher(['crashed', 'running']);
		const watchdog = new AppWatchdog({ launcher });
		await watchdog.watch(projectPath);
		expect(starts).toEqual([encodeProjectId(projectPath)]);
		watchdog.unwatch(projectPath);
	});

	test('never starts an app the operator had left stopped', async () => {
		const { launcher, starts } = fakeLauncher(['stopped', 'stopped']);
		const watchdog = new AppWatchdog({ launcher });
		await watchdog.watch(projectPath);
		await watchdog.tick();
		expect(starts).toEqual([]);
	});

	test('stands down when a supervised app is stopped out-of-band mid-session', async () => {
		const { launcher, starts } = fakeLauncher(['running', 'stopped', 'crashed']);
		const watchdog = new AppWatchdog({ launcher });
		await watchdog.watch(projectPath);
		await watchdog.tick();
		await watchdog.tick();
		expect(starts).toEqual([]);
	});

	test('gives up after the restart cap instead of respawning a crash loop', async () => {
		const { launcher, starts } = fakeLauncher(['running', 'crashed'], { failStart: true });
		const watchdog = new AppWatchdog({ launcher, intervalMs: 60_000 });
		await watchdog.watch(projectPath);
		// The gap guard suppresses attempts 2 and 3 within the same window; the cap is what
		// finally stops the watchdog from trying again for the rest of the session.
		for (let i = 0; i < 6; i += 1) await watchdog.tick();
		expect(starts.length).toBeLessThanOrEqual(3);
		expect(starts.length).toBeGreaterThan(0);
		watchdog.unwatch(projectPath);
	});

	test('keeps supervising until the last concurrent session releases the app', async () => {
		const { launcher, starts } = fakeLauncher(['running', 'crashed']);
		const watchdog = new AppWatchdog({ launcher });
		await watchdog.watch(projectPath);
		await watchdog.watch(projectPath);
		watchdog.unwatch(projectPath);
		await watchdog.tick();
		expect(starts).toHaveLength(1);
		watchdog.unwatch(projectPath);
		await watchdog.tick();
		expect(starts).toHaveLength(1);
	});

	test('survives a launcher that cannot report status', async () => {
		const watchdog = new AppWatchdog({
			launcher: {
				getStatus: () => Promise.reject(new Error('project not found')),
				start: () => Promise.reject(new Error('unreachable')),
			},
		});
		await watchdog.watch(projectPath);
		await watchdog.tick();
	});
});

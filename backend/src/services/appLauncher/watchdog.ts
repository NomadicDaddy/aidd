import type { AppLaunchRecord, AppLaunchStatus } from './shared.ts';

import { webLogger } from '../../logger.ts';
import { encodeProjectId } from '../../paths.ts';

/** How often a supervised app's launch row is re-checked. */
const DEFAULT_INTERVAL_MS = 15_000;
/** Restart attempts allowed per watch before the watchdog gives up on a project. */
const MAX_RESTARTS = 3;
/** Minimum gap between two restart attempts, so a crash-on-boot loop cannot spin. */
const MIN_RESTART_GAP_MS = 30_000;

/** The slice of AppLauncherService the watchdog uses; narrowed so it can be faked in tests. */
export interface AppWatchdogLauncher {
	getStatus(projectId: string): Promise<AppLaunchRecord>;
	start(projectId: string): Promise<AppLaunchRecord>;
}

interface Supervision {
	givenUp: boolean;
	lastRestartAt: number;
	refCount: number;
	restarts: number;
}

/**
 * Keeps a launcher-managed app alive for as long as a pipeline session depends on it.
 *
 * The failure this exists for: an app died partway through a pipeline session, and every
 * remaining step that needed to verify against it parked its feature instead. Nothing restarted
 * the app and nothing said it was gone — the session finished green with three features parked.
 *
 * Supervision is deliberately narrow. A watch only takes hold of an app that was running (or
 * crashed, and came back on the preflight restart) when the session began: an app the operator had
 * deliberately stopped is not something a pipeline gets to start, and one they stop mid-session is
 * released rather than fought over. Restarts are capped and spaced, so an app that crashes on boot
 * is reported once instead of being respawned for the length of the session.
 */
export class AppWatchdog {
	private readonly launcher: AppWatchdogLauncher;
	private readonly intervalMs: number;
	private readonly supervised = new Map<string, Supervision>();
	private timer: null | ReturnType<typeof setInterval> = null;
	private ticking = false;

	constructor(input: { intervalMs?: number; launcher: AppWatchdogLauncher }) {
		this.launcher = input.launcher;
		this.intervalMs = input.intervalMs ?? DEFAULT_INTERVAL_MS;
	}

	/**
	 * Begins supervising a project's app for one session, restarting it first if it is crashed.
	 *
	 * Nested and concurrent sessions on the same project share one supervision entry by reference
	 * count, so the app stays watched until the last of them releases it.
	 * @param projectPath Absolute path of the project whose app the session depends on.
	 */
	async watch(projectPath: string): Promise<void> {
		const existing = this.supervised.get(projectPath);
		if (existing) {
			existing.refCount += 1;
			return;
		}
		const status = await this.readStatus(projectPath);
		// 'stopped' covers both a deliberately stopped app and a project that has never been
		// launched through the panel at all. Neither is this session's to start.
		if (status === undefined || status === 'stopped') return;
		const entry: Supervision = { givenUp: false, lastRestartAt: 0, refCount: 1, restarts: 0 };
		this.supervised.set(projectPath, entry);
		if (this.timer === null) {
			this.timer = setInterval(() => void this.tick(), this.intervalMs);
			this.timer.unref?.();
		}
		if (status === 'crashed') await this.restart(projectPath, entry);
	}

	/**
	 * Releases one session's claim on a project's app. The app is left running either way — the
	 * watchdog restarts apps, it never stops them.
	 * @param projectPath
	 */
	unwatch(projectPath: string): void {
		const entry = this.supervised.get(projectPath);
		if (!entry) return;
		entry.refCount -= 1;
		if (entry.refCount > 0) return;
		this.release(projectPath);
	}

	/**
	 * One supervision pass. Exposed so tests can drive it directly instead of waiting on the timer.
	 */
	async tick(): Promise<void> {
		if (this.ticking) return;
		this.ticking = true;
		try {
			for (const [projectPath, entry] of [...this.supervised]) {
				if (entry.givenUp) continue;
				const status = await this.readStatus(projectPath);
				if (status === 'crashed') {
					await this.restart(projectPath, entry);
				} else if (status === 'stopped') {
					// Someone stopped it on purpose while the session ran. Restarting here would
					// undo a deliberate act, so record it and stand down for this project.
					webLogger.info(
						{ projectPath },
						'app watchdog released a supervised app that was stopped out-of-band',
					);
					this.release(projectPath);
				}
			}
		} finally {
			this.ticking = false;
		}
	}

	/**
	 * Drops a project from supervision, stopping the timer once nothing is left to watch.
	 * @param projectPath
	 */
	private release(projectPath: string): void {
		this.supervised.delete(projectPath);
		if (this.supervised.size === 0 && this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private async readStatus(projectPath: string): Promise<AppLaunchStatus | undefined> {
		try {
			return (await this.launcher.getStatus(encodeProjectId(projectPath))).status;
		} catch (err) {
			webLogger.warn(
				{ error: err, projectPath },
				'app watchdog could not read app launch status',
			);
			return undefined;
		}
	}

	private async restart(projectPath: string, entry: Supervision): Promise<void> {
		const now = Date.now();
		if (entry.restarts >= MAX_RESTARTS) {
			entry.givenUp = true;
			webLogger.error(
				{ projectPath, restarts: entry.restarts },
				'app watchdog gave up restarting a crashed app; steps that verify against it will keep failing',
			);
			return;
		}
		if (entry.restarts > 0 && now - entry.lastRestartAt < MIN_RESTART_GAP_MS) return;
		entry.restarts += 1;
		entry.lastRestartAt = now;
		try {
			await this.launcher.start(encodeProjectId(projectPath));
			webLogger.info(
				{ attempt: entry.restarts, projectPath },
				'app watchdog restarted a crashed app for a running pipeline session',
			);
		} catch (err) {
			webLogger.warn(
				{ attempt: entry.restarts, error: err, projectPath },
				'app watchdog failed to restart a crashed app',
			);
		}
	}
}

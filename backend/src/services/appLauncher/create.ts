import type { WebDatabase } from '../../db/client.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';
import type { ProjectService } from '../projectService.ts';

import { AppLauncherService } from './launcher.ts';
import { AppWatchdog } from './watchdog.ts';

export interface AppLauncherBundle {
	appLauncherService: AppLauncherService;
	appWatchdog: AppWatchdog;
}

/**
 * Builds the app launcher together with the watchdog that supervises what it starts.
 *
 * They are paired here because the watchdog is useless without the launcher and the launcher
 * leaves crashed apps lying where they fall without the watchdog; boot wires one thing.
 * @param input
 * @param input.db The panel database the launcher records app launches in.
 * @param input.hub Socket hub used to broadcast launch status changes.
 * @param input.projectService Resolves project ids to on-disk project paths.
 * @returns The launcher and the watchdog that supervises it.
 */
export function createAppLauncher(input: {
	db: WebDatabase;
	hub: WebSocketHub;
	projectService: ProjectService;
}): AppLauncherBundle {
	const appLauncherService = new AppLauncherService(input);
	return { appLauncherService, appWatchdog: new AppWatchdog({ launcher: appLauncherService }) };
}

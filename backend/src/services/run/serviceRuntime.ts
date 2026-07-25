import type { HeartbeatWatcherContext } from './heartbeatWatcherTypes.ts';
import type { RunTailWatcher } from './tailWatcher.ts';

import { HeartbeatWatcher } from './heartbeatWatcher.ts';

interface RunRuntimeResources {
	heartbeatWatchers: Map<string, HeartbeatWatcher>;
	ingestTimer: null | ReturnType<typeof setInterval>;
	orphanSweepTimer: null | ReturnType<typeof setInterval>;
	tailWatchers: Map<string, RunTailWatcher>;
}

export function disposeRunRuntime(resources: RunRuntimeResources): void {
	if (resources.ingestTimer) clearInterval(resources.ingestTimer);
	if (resources.orphanSweepTimer) clearInterval(resources.orphanSweepTimer);
	const tails = [...resources.tailWatchers.values()];
	resources.tailWatchers.clear();
	const heartbeats = [...resources.heartbeatWatchers.values()];
	resources.heartbeatWatchers.clear();
	for (const tail of tails) void tail.stop();
	for (const heartbeat of heartbeats) void heartbeat.stop();
}

export async function ensureRunHeartbeatWatcher(
	projectPath: string,
	heartbeatWatchers: Map<string, HeartbeatWatcher>,
	context: HeartbeatWatcherContext,
): Promise<void> {
	if (heartbeatWatchers.has(projectPath)) return;
	const watcher = await HeartbeatWatcher.start(projectPath, context);
	heartbeatWatchers.set(projectPath, watcher);
}

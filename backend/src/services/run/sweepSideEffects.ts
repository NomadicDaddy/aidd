import type { CliActiveRunSource } from 'aidd-shared/metadata/active-runs';

import type { TelemetryService } from '../telemetryService.ts';
import type { SweptRunInfo } from './activeRunQueries.ts';

import { webLogger } from '../../logger.ts';
import { type RunTailWatcher } from './tailWatcher.ts';
import { TELEMETRY_RUN_SOURCES } from './types.ts';

export interface SweptRunSideEffectDeps {
	tailWatchers: Map<string, RunTailWatcher>;
	telemetryService: TelemetryService;
}

// Terminal side effects for a swept orphan, mirroring the heartbeat paths: stop the launch-time
// tail watcher (whose fs.watch handle would otherwise leak) and sync the linked invocation row.
export async function applySweptRunSideEffects(
	deps: SweptRunSideEffectDeps,
	info: SweptRunInfo
): Promise<void> {
	const tail = deps.tailWatchers.get(info.runId);
	if (tail) {
		deps.tailWatchers.delete(info.runId);
		await tail.stop();
	}
	if (!TELEMETRY_RUN_SOURCES.has(info.source as CliActiveRunSource)) return;
	// The sweep already drove the `runs` row terminal (reconcileDeadRun → failed); sync the
	// linked invocation from that authoritative row instead of writing a parallel status.
	await deps.telemetryService.reconcileInvocationFromRun(info.runId).catch((error: unknown) => {
		webLogger.warn(
			{ err: error, runId: info.runId },
			'Failed to sync swept run invocation telemetry'
		);
	});
}

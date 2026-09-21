import type { WebDatabase } from '../../db/client.ts';
import type { DbCommands } from '../../db/commands.ts';
import type { RunContinuationReason } from '../../types.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';
import type { TelemetryService } from '../telemetryService.ts';
import type { RunTailWatcher } from './tailWatcher.ts';

import { type runs } from '../../db/schema.ts';

export const HEARTBEAT_POLL_FALLBACK_MS = 5_000;
export const STALE_SWEEP_INTERVAL_MS = 30_000;

export const TERMINAL_HEARTBEAT_STATES: ReadonlySet<string> = new Set([
	'blocked',
	'completed',
	'failed',
	'stopped',
	'waiting_approval',
]);

export interface HeartbeatWatcherContext {
	commands: DbCommands;
	db: WebDatabase;
	hub: WebSocketHub;
	onProjectChanged?: (projectPath: string) => void;
	/** Fired after a run terminalizes continuation-eligible (wall-clock timeout with work
	 * remaining, or initializer completion). Fire-and-forget: the receiver owns auto-chain
	 * gating and must never throw back into the watcher. */
	onRunContinuation?: (runId: string, reason: RunContinuationReason) => void;
	/** Fired after a run reaches a terminal status so admission can promote the next queued row. */
	onRunTerminal?: () => void;
	tailWatchers: Map<string, RunTailWatcher>;
	telemetry: TelemetryService;
}

export type WebRunRow = typeof runs.$inferSelect;

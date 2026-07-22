/**
 * The WebSocket event contract — the single source of truth for every real-time message the backend
 * pushes to the web client over `/api/v1/ws`.
 *
 * With this union as the contract:
 *
 * - the backend hub's `broadcast()` only accepts a `WebSocketEvent`, so a typo'd or unlisted event
 *   is a compile error at the emit site; and
 * - the frontend's realtime-invalidation handler switches exhaustively over `WebSocketEventType`, so
 *   adding a new event here without wiring its query invalidation breaks the build.
 *
 * Documentation of record (events, triggers, query-invalidation mapping, and the intentional polling
 * backstops): `docs/architecture/websocket-events.md`.
 *
 * The payload shapes here are intentionally permissive supersets of the values the emitters pass
 * (e.g. nullable `exitCode`/`stopReason` mirror `RunRecord`); they constrain the field set and the
 * `type` discriminant without coupling this package to backend-only enums.
 */

export const webSocketEventTypes = [
	'run_status',
	'run_output',
	'pipeline_status',
	'director_cycle',
	'suggestion_status',
	'app_launch',
	'connected',
	'ack',
] as const;

export type WebSocketEventType = (typeof webSocketEventTypes)[number];

/** A run's lifecycle/status transition. `runId` identifies the affected run. */
export interface RunStatusEvent {
	payload: {
		error?: string | undefined;
		exitCode?: null | number | undefined;
		source?: string | undefined;
		status: string;
		stopReason?: null | string | undefined;
		stopRequested?: boolean | undefined;
		// Human-readable run summary, carried on terminal transitions so the client can surface the
		// outcome (e.g. *why* a run did no work) in a toast without re-fetching the run record.
		summary?: null | string | undefined;
	};
	runId: string;
	type: 'run_status';
}

/** A chunk of a run's live stdout. Hot-path event (potentially many per second). */
export interface RunOutputEvent {
	payload: { chunk: string; stream: 'stdout' };
	runId: string;
	type: 'run_output';
}

/** A pipeline session's status transition (queued → running → completed/failed). */
export interface PipelineStatusEvent {
	payload: { sessionId: string; status: string };
	type: 'pipeline_status';
}

/** A director cycle's stage/status transition. */
export interface DirectorCycleEvent {
	payload: {
		cycleId: string;
		directAiMeta?: { model: string; provider: string; reasoningEffort: string };
		stage: string;
		status: string;
		totalSuggestions?: number;
	};
	type: 'director_cycle';
}

/** A director suggestion being dismissed or launched. */
export interface SuggestionStatusEvent {
	payload: {
		id: string;
		launchedPipelineSessionId?: null | string;
		launchedRunId?: null | string;
		status: 'dismissed' | 'launched';
	};
	type: 'suggestion_status';
}

/** A project's app-launcher start/stop (also implies its dev/start ports came up or down). */
export interface AppLaunchEvent {
	payload: { projectId: string; status: string };
	type: 'app_launch';
}

/** Transport-level: the server confirms a successful connection. Consumed in `useWebSocket`. */
export interface ConnectedEvent {
	payload: { connected: true };
	type: 'connected';
}

/** Transport-level: the server echoes a client message back as an acknowledgement. */
export interface AckEvent {
	payload: unknown;
	type: 'ack';
}

export type WebSocketEvent =
	| AckEvent
	| AppLaunchEvent
	| ConnectedEvent
	| DirectorCycleEvent
	| PipelineStatusEvent
	| RunOutputEvent
	| RunStatusEvent
	| SuggestionStatusEvent;

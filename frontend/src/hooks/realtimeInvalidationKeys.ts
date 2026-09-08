import type { WebSocketEventType } from 'aidd-shared/contracts/websocket';

import { webSocketEventTypes } from 'aidd-shared/contracts/websocket';

/**
 * What the realtime layer refreshes, declared once.
 *
 * Both consumers read this table: the per-event handler in useRealtimeInvalidation, and the
 * reconnect sweep that recovers whatever the socket missed while it was down. They used to be two
 * hand-written lists, and the copy drifted — reconnect omitted the keys `director_cycle` and
 * `suggestion_status` invalidate, so fleet rows and stored run output stayed stale across exactly
 * the event a reconnect exists to survive (a backend restart). Deriving the reconnect set from this
 * table makes that class of drift unrepresentable.
 */

/** A React Query key the realtime layer invalidates. */
export type RealtimeQueryKey = readonly string[];

export interface RealtimeEventInvalidation {
	/** Keys the handler invalidates verbatim when a frame of this type arrives. */
	readonly keys: readonly RealtimeQueryKey[];
	/** Why an event with no keys refreshes nothing. Required exactly when `keys` is empty. */
	readonly noQueries?: string;
	/**
	 * Keys the handler invalidates with an id read off the payload appended, when the payload
	 * carries one. Reconnect invalidates the bare prefix, which prefix-matches every scoped entry.
	 */
	readonly scoped?: {
		readonly by: 'projectId' | 'sessionId';
		readonly prefixes: readonly RealtimeQueryKey[];
	};
}

/**
 * Every event in the contract, and the queries it refreshes. `Record<WebSocketEventType, …>` is the
 * exhaustiveness guard: adding an event to aidd-shared/contracts/websocket breaks this build until
 * its entry is written, which is what stops an uncovered event from being "fixed" by polling.
 */
export const realtimeEventInvalidations: Readonly<
	Record<WebSocketEventType, RealtimeEventInvalidation>
> = {
	ack: { keys: [], noQueries: 'Transport-level ping reply, handled in useWebSocket.' },
	app_launch: {
		// The Dashboard reads port state out of its own summary rather than a second query, so a
		// launch has to reach that entry too.
		keys: [['app-launch-all'], ['port-status'], ['projects', 'dashboard-summary']],
		scoped: { by: 'projectId', prefixes: [['app-launch']] },
	},
	connected: { keys: [], noQueries: 'Transport-level handshake, handled in useWebSocket.' },
	director_cycle: {
		keys: [
			['director-cycles'],
			['runs'],
			['run-output'],
			['suggestions'],
			// Two elements deliberately: the one-element ['director'] key would also match the
			// director-profile and director-chat families, which a cycle transition does not change.
			['director', 'fleet'],
		],
	},
	pipeline_progress: {
		keys: [['pipeline-sessions']],
		scoped: { by: 'sessionId', prefixes: [['pipeline-session-report']] },
	},
	pipeline_status: {
		keys: [['pipeline-sessions'], ['telemetry'], ['diary'], ['project']],
		scoped: { by: 'sessionId', prefixes: [['pipeline-session-report']] },
	},
	run_output: {
		keys: [],
		noQueries:
			'Consumed directly by useRunLiveOutput, which appends the chunk to React state. ' +
			'The stored ["run-output", id] query is refreshed by director_cycle instead, when the ' +
			'run it belongs to has finished writing.',
	},
	run_status: {
		// A pipeline-owned run's status flip changes its session's step rows; the bare
		// pipeline-session-report prefix refreshes every expanded report on the unified Runs feed.
		// ['project'] too: the open detail page derives its blueprint wording from live run and
		// pipeline state, so a run that starts, finishes, or stops must re-read it. Without this the
		// card keeps whatever it was told at load — which is how a finished run left a spinner up.
		keys: [
			['runs'],
			['projects'],
			['project'],
			['telemetry'],
			['diary'],
			['pipeline-session-report'],
		],
	},
	suggestion_status: {
		keys: [['suggestions'], ['runs'], ['pipeline-sessions'], ['director', 'fleet']],
	},
};

/**
 * Keys reconnect refreshes that no event produces. Each one needs a reason, because the default is
 * that a key with no realtime producer does not belong here.
 *
 * Empty since `run_status` and `pipeline_status` took over ['project']: the detail page's blueprint
 * status is derived from live run and pipeline state, so those events must refresh it during a
 * session and not only after a reconnect.
 */
export const reconnectOnlyKeys: readonly { key: RealtimeQueryKey; reason: string }[] = [];

function isPrefixOf(prefix: RealtimeQueryKey, key: RealtimeQueryKey): boolean {
	return prefix.length < key.length && prefix.every((part, index) => part === key[index]);
}

function deriveReconnectKeys(): RealtimeQueryKey[] {
	const declared: RealtimeQueryKey[] = [];
	const seen = new Set<string>();
	const add = (key: RealtimeQueryKey): void => {
		const id = JSON.stringify(key);
		if (seen.has(id)) return;
		seen.add(id);
		declared.push(key);
	};
	for (const event of Object.values(realtimeEventInvalidations)) {
		for (const key of event.keys) add(key);
		for (const prefix of event.scoped?.prefixes ?? []) add(prefix);
	}
	for (const extra of reconnectOnlyKeys) add(extra.key);
	// invalidateQueries matches by prefix, so a key another declared key already covers is a second
	// refetch of the same rows: ['projects'] refreshes ['projects','dashboard-summary'] on its own.
	// Reconnect stays a bounded set because several tabs reconnect at once.
	return declared.filter((key) => !declared.some((other) => isPrefixOf(other, key)));
}

/** The bounded set a reconnect refreshes: every key an event produces, prefix-reduced. */
export const realtimeReconnectKeys: readonly RealtimeQueryKey[] = deriveReconnectKeys();

function isWebSocketEventType(value: string): value is WebSocketEventType {
	return (webSocketEventTypes as readonly string[]).includes(value);
}

function extractId(payload: unknown, field: string): string | undefined {
	if (typeof payload !== 'object' || payload === null) return undefined;
	const value = (payload as Record<string, unknown>)[field];
	return typeof value === 'string' ? value : undefined;
}

/**
 * The keys one incoming frame invalidates. An unrecognized type (including the transport's `raw`
 * JSON-parse fallback) refreshes nothing.
 */
export function realtimeInvalidationKeysForMessage(message: {
	payload: unknown;
	type: string;
}): RealtimeQueryKey[] {
	if (!isWebSocketEventType(message.type)) return [];
	const entry = realtimeEventInvalidations[message.type];
	const keys: RealtimeQueryKey[] = [...entry.keys];
	const scopedId = entry.scoped ? extractId(message.payload, entry.scoped.by) : undefined;
	if (entry.scoped && scopedId) {
		for (const prefix of entry.scoped.prefixes) keys.push([...prefix, scopedId]);
	}
	return keys;
}

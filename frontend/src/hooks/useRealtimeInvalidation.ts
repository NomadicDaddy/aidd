import type { WebSocketEventType } from 'aidd-shared/contracts/websocket';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { createInvalidationCoalescer } from '../lib/invalidationCoalescer.ts';
import { clearStopRequested, markStopRequested } from '../lib/stopRequests.ts';
import {
	realtimeInvalidationKeysForMessage,
	realtimeReconnectKeys,
} from './realtimeInvalidationKeys.ts';
import {
	type SocketMessage,
	useWebSocketReconnect,
	useWebSocketSubscribe,
} from './useWebSocket.ts';

// Compile-time exhaustiveness guard for the WebSocket event contract. Because the switch below scopes
// its discriminant to `WebSocketEventType`, covering every member makes `eventType` here `never`.
// Adding a new event to aidd-shared/contracts/websocket therefore breaks this build until a case is
// added — which is exactly what stops an uncovered event from being "fixed" by re-introducing polling.
// At runtime an unrecognized frame (e.g. the 'raw' JSON-parse fallback) simply falls through, ignored.
function assertHandled(_eventType: never): void {}

// Mirror run_status stop signals into the local stop-request set: a stopRequested broadcast flips
// the row to "Stopping…" ahead of the refetch (including stops requested from another tab), and a
// terminal transition retires the entry.
function trackStopRequestSignal(runId: string | undefined, payload: unknown): void {
	if (!runId || typeof payload !== 'object' || payload === null) return;
	const { status, stopRequested } = payload as { status?: unknown; stopRequested?: unknown };
	if (stopRequested === true) {
		markStopRequested(runId);
		return;
	}
	if (typeof status === 'string' && status !== 'running') clearStopRequested(runId);
}

export function useRealtimeInvalidation(): void {
	const queryClient = useQueryClient();
	// A run fanning out over the fleet emits a frame per project, and each frame would otherwise
	// start its own refetch of the same keys. Collapse a burst into one refetch per key instead —
	// see lib/invalidationCoalescer.ts for what a refetch per frame costs the backend.
	const [coalescer] = useState(() => createInvalidationCoalescer(queryClient));
	useEffect(() => () => coalescer.dispose(), [coalescer]);

	// Which keys a frame refreshes is declared once in realtimeInvalidationKeys.ts, which is also
	// where the reconnect set below is derived from. The switch routes; it holds no keys of its own.
	const invalidateDeclared = (message: SocketMessage) => {
		for (const queryKey of realtimeInvalidationKeysForMessage(message)) {
			coalescer.invalidate([...queryKey]);
		}
	};

	const handleMessage = (message: SocketMessage) => {
		// Scope the untrusted wire `type` to the contract's event types. Every type must be handled
		// here or in the transport layer; the `default` arm's assertHandled() enforces that at compile
		// time. See the contract: aidd-shared/contracts/websocket + docs/architecture/websocket-events.md.
		const eventType = message.type as WebSocketEventType;
		switch (eventType) {
			case 'ack':
			case 'connected':
			case 'run_output':
				// No cache effect. Each carries its reason in realtimeInvalidationKeys.ts.
				return;
			case 'app_launch':
			case 'director_cycle':
			case 'pipeline_progress':
			case 'pipeline_status':
			case 'suggestion_status':
				invalidateDeclared(message);
				return;
			case 'run_status':
				trackStopRequestSignal(message.runId, message.payload);
				invalidateDeclared(message);
				return;
			default:
				assertHandled(eventType);
		}
	};

	// A reconnect after a backend restart refreshes everything the socket updates, and several tabs
	// reconnect together — the burst that made the panel's own restart its heaviest moment. One
	// refetch per key, and a second reconnect while the first is still fetching does not double them.
	const handleReconnect = () => {
		for (const queryKey of realtimeReconnectKeys) coalescer.invalidate([...queryKey]);
	};

	useWebSocketSubscribe(handleMessage);
	useWebSocketReconnect(handleReconnect);
}

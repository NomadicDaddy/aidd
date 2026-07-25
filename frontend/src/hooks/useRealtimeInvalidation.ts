import type { WebSocketEventType } from 'aidd-shared/contracts/websocket';

import { useQueryClient } from '@tanstack/react-query';

import { clearStopRequested, markStopRequested } from '../lib/stopRequests.ts';
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

function extractSessionId(payload: unknown): string | undefined {
	if (typeof payload !== 'object' || payload === null) return undefined;
	const value = (payload as { sessionId?: unknown }).sessionId;
	return typeof value === 'string' ? value : undefined;
}

function extractProjectId(payload: unknown): string | undefined {
	if (typeof payload !== 'object' || payload === null) return undefined;
	const value = (payload as { projectId?: unknown }).projectId;
	return typeof value === 'string' ? value : undefined;
}

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

	const handleMessage = (message: SocketMessage) => {
		// Scope the untrusted wire `type` to the contract's event types. Every type must be handled
		// here or in the transport layer; the `default` arm's assertHandled() enforces that at compile
		// time. See the contract: aidd-shared/contracts/websocket + docs/architecture/websocket-events.md.
		const eventType = message.type as WebSocketEventType;
		switch (eventType) {
			case 'ack':
			case 'connected':
				// Transport-level frames handled in useWebSocket; no cache effect.
				return;
			case 'app_launch': {
				void queryClient.invalidateQueries({ queryKey: ['app-launch-all'] });
				const projectId = extractProjectId(message.payload);
				if (projectId) {
					void queryClient.invalidateQueries({ queryKey: ['app-launch', projectId] });
				}
				void queryClient.invalidateQueries({ queryKey: ['port-status'] });
				return;
			}
			case 'director_cycle':
				void queryClient.invalidateQueries({ queryKey: ['director-cycles'] });
				void queryClient.invalidateQueries({ queryKey: ['runs'] });
				void queryClient.invalidateQueries({ queryKey: ['run-output'] });
				void queryClient.invalidateQueries({ queryKey: ['suggestions'] });
				void queryClient.invalidateQueries({ queryKey: ['director', 'fleet'] });
				return;
			case 'pipeline_status': {
				void queryClient.invalidateQueries({ queryKey: ['pipeline-sessions'] });
				void queryClient.invalidateQueries({ queryKey: ['telemetry'] });
				void queryClient.invalidateQueries({ queryKey: ['diary'] });
				const sessionId = extractSessionId(message.payload);
				if (sessionId) {
					void queryClient.invalidateQueries({
						queryKey: ['pipeline-session-report', sessionId],
					});
				}
				return;
			}
			case 'run_output':
				// Consumed directly by useRunLiveOutput (appends to React state); no query to invalidate.
				return;
			case 'run_status':
				trackStopRequestSignal(message.runId, message.payload);
				void queryClient.invalidateQueries({ queryKey: ['runs'] });
				void queryClient.invalidateQueries({ queryKey: ['projects'] });
				void queryClient.invalidateQueries({ queryKey: ['telemetry'] });
				void queryClient.invalidateQueries({ queryKey: ['diary'] });
				// A pipeline-owned run's status flip changes its session's step rows; refresh
				// expanded reports on the unified Runs feed without waiting for the 3s poll.
				void queryClient.invalidateQueries({ queryKey: ['pipeline-session-report'] });
				return;
			case 'suggestion_status':
				void queryClient.invalidateQueries({ queryKey: ['suggestions'] });
				void queryClient.invalidateQueries({ queryKey: ['runs'] });
				void queryClient.invalidateQueries({ queryKey: ['pipeline-sessions'] });
				void queryClient.invalidateQueries({ queryKey: ['director', 'fleet'] });
				return;
			default:
				assertHandled(eventType);
		}
	};

	const handleReconnect = () => {
		void queryClient.invalidateQueries({ queryKey: ['runs'] });
		void queryClient.invalidateQueries({ queryKey: ['project'] });
		void queryClient.invalidateQueries({ queryKey: ['projects'] });
		void queryClient.invalidateQueries({ queryKey: ['pipeline-sessions'] });
		void queryClient.invalidateQueries({ queryKey: ['pipeline-session-report'] });
		void queryClient.invalidateQueries({ queryKey: ['director-cycles'] });
		void queryClient.invalidateQueries({ queryKey: ['suggestions'] });
		void queryClient.invalidateQueries({ queryKey: ['telemetry'] });
		void queryClient.invalidateQueries({ queryKey: ['diary'] });
		void queryClient.invalidateQueries({ queryKey: ['app-launch-all'] });
		void queryClient.invalidateQueries({ queryKey: ['app-launch'] });
		void queryClient.invalidateQueries({ queryKey: ['port-status'] });
	};

	useWebSocketSubscribe(handleMessage);
	useWebSocketReconnect(handleReconnect);
}

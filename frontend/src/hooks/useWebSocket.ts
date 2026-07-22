import { useEffect } from 'react';

import { probeAuth } from '../api/client.ts';
import { createTraceId, isTraceEnabled, traceDataMovement } from '../lib/dataMovementTrace.ts';
import { currentAuthToken, useAuthTokenStore } from '../stores/authTokenStore.ts';
import { evaluateLiveness, LIVENESS_TIMEOUT_MS, PING_INTERVAL_MS } from './webSocketLiveness.ts';
import { summarizeSocketMessage } from './webSocketSummary.ts';

// Untrusted-wire envelope. The backend only ever sends events from the contract
// (aidd-shared/contracts/websocket — the `WebSocketEvent` union), but incoming frames are arbitrary
// JSON and include a synthetic 'raw' fallback on parse failure, so the transport type stays loose.
// Consumers that act on events narrow against `WebSocketEventType` (see useRealtimeInvalidation).
export interface SocketMessage {
	payload: unknown;
	runId?: string;
	type: string;
}

const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;

type MessageListener = (message: SocketMessage) => void;
type ReconnectListener = () => void;

const messageListeners = new Set<MessageListener>();
const reconnectListeners = new Set<ReconnectListener>();

let socket: null | WebSocket = null;
let retryTimer: null | ReturnType<typeof setTimeout> = null;
let retryDelay = INITIAL_RETRY_DELAY_MS;
let started = false;
let everConnected = false;
let authTokenUnsubscribe: (() => void) | null = null;
// Wall-clock of the most recently received frame (any type, including ping acks); reset on each new
// connection so a fresh socket gets the full window. Drives half-open detection in livenessTick.
let lastMessageAt: null | number = null;
let livenessTimer: null | ReturnType<typeof setInterval> = null;
// The browser cannot read the HTTP status of a rejected WS handshake, so a 401 on the
// upgrade looks like any other failure. Probe a guarded HTTP endpoint once per disconnect
// streak; its 401 path opens the access-token prompt. Reset on each confirmed connection.
let authProbedSinceConnect = false;

function connect(): void {
	const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
	const targetUrl = new URL(`${protocol}://${window.location.host}/api/v1/ws`);
	const token = currentAuthToken();
	// Transport trade-off (deliberate, defense-in-depth note — not a live exploit):
	// the token rides in the WS URL query because the browser WebSocket API cannot set an
	// Authorization header on the upgrade request. Query strings can leak via proxy/server
	// access logs and Referer, but this socket only ever targets same-origin localhost
	// (window.location.host, see above), so there is no third-party proxy or cross-origin
	// referer to leak to. The harder transport (a short-lived single-use ticket minted over
	// authenticated HTTP, then redeemed on the WS upgrade) is the upgrade path if aidd ever
	// serves over an untrusted network; on localhost it adds a round-trip for no real gain.
	// See the matching storage note in stores/authTokenStore.ts.
	if (token) targetUrl.searchParams.set('token', token);
	const target = targetUrl.toString();
	const traceId = createTraceId('socket');
	// Give the new connection a full staleness window before the watchdog can judge it half-open.
	lastMessageAt = Date.now();
	let connectionConfirmed = false;
	traceDataMovement({
		category: 'event',
		layer: 'socket',
		operation: 'socket.connect',
		target: '/api/v1/ws',
		traceId,
	});
	socket = new WebSocket(target);
	function confirmConnection() {
		if (connectionConfirmed) return;
		connectionConfirmed = true;
		const wasConnected = everConnected;
		retryDelay = INITIAL_RETRY_DELAY_MS;
		everConnected = true;
		authProbedSinceConnect = false;
		if (wasConnected) {
			traceDataMovement({
				category: 'event',
				layer: 'socket',
				operation: 'socket.reconnect',
				status: 'success',
				target: '/api/v1/ws',
				traceId,
			});
			for (const listener of reconnectListeners) listener();
		}
	}
	socket.addEventListener('open', () => {
		traceDataMovement({
			category: 'event',
			layer: 'socket',
			operation: 'socket.open',
			status: 'success',
			target: '/api/v1/ws',
			traceId,
		});
	});
	socket.addEventListener('message', (event) => {
		// Any inbound frame proves the socket is alive — refresh the silence clock before parsing so
		// even the synthetic 'raw' fallback and ping acks keep the watchdog from a false reconnect.
		lastMessageAt = Date.now();
		let parsed: SocketMessage;
		try {
			parsed = JSON.parse(String(event.data)) as SocketMessage;
		} catch {
			parsed = { payload: event.data, type: 'raw' };
		}
		// run_output messages arrive on the hot path (potentially dozens/sec). summarizeSocketMessage
		// allocates a summary object and slices the chunk string, so only build it when tracing is
		// actually enabled — otherwise this runs for every chunk of a live run for nothing.
		if (isTraceEnabled()) {
			traceDataMovement({
				category: 'event',
				layer: 'socket',
				operation: 'socket.message',
				summary: summarizeSocketMessage(parsed),
				target: '/api/v1/ws',
				traceId,
			});
		}
		if (parsed.type === 'connected') confirmConnection();
		for (const listener of messageListeners) listener(parsed);
	});
	socket.addEventListener('error', () => {
		traceDataMovement({
			category: 'event',
			layer: 'socket',
			operation: 'socket.error',
			status: 'error',
			target: '/api/v1/ws',
			traceId,
		});
		socket?.close();
	});
	socket.addEventListener('close', (event) => {
		traceDataMovement({
			category: 'event',
			layer: 'socket',
			operation: 'socket.close',
			status: String(event.code),
			summary: { clean: event.wasClean, reason: event.reason },
			target: '/api/v1/ws',
			traceId,
		});
		if (!authProbedSinceConnect) {
			authProbedSinceConnect = true;
			void probeAuth();
		}
		if (retryTimer !== null) return;
		const scheduledDelay = retryDelay;
		traceDataMovement({
			category: 'event',
			layer: 'socket',
			operation: 'socket.reconnect',
			status: 'scheduled',
			summary: { retryDelay: scheduledDelay },
			target: '/api/v1/ws',
			traceId,
		});
		retryTimer = setTimeout(() => {
			retryTimer = null;
			retryDelay = Math.min(scheduledDelay * 2, MAX_RETRY_DELAY_MS);
			connect();
		}, scheduledDelay);
	});
}

function resetConnection(): void {
	if (retryTimer !== null) {
		clearTimeout(retryTimer);
		retryTimer = null;
	}
	retryDelay = INITIAL_RETRY_DELAY_MS;
	socket?.close();
	socket = null;
	if (started) connect();
}

// Watchdog tick: ping a live socket to keep its silence clock fresh, or close a half-open one so the
// close→retry path reconnects. We close (not resetConnection) on purpose — the close handler is the
// single, idempotent reconnect path, so this cannot spawn a duplicate socket that would double the
// transcript; the fresh connection's `connected` frame fires the reconnect listeners that refetch the
// run-output snapshot and unfreeze the console.
function livenessTick(): void {
	if (!started) return;
	const isOpen = socket !== null && socket.readyState === WebSocket.OPEN;
	const action = evaluateLiveness({
		isOpen,
		lastMessageAt,
		now: Date.now(),
		timeoutMs: LIVENESS_TIMEOUT_MS,
	});
	if (action === 'reconnect') {
		traceDataMovement({
			category: 'event',
			layer: 'socket',
			operation: 'socket.liveness',
			status: 'stale',
			summary: { silentForMs: lastMessageAt === null ? null : Date.now() - lastMessageAt },
			target: '/api/v1/ws',
			traceId: createTraceId('socket'),
		});
		socket?.close();
		return;
	}
	if (action === 'ping') {
		try {
			socket?.send(JSON.stringify({ type: 'ping' }));
		} catch {
			// Socket dropped out of OPEN between the readyState read and here; let the retry path take over.
			socket?.close();
		}
	}
}

function ensureStarted(): void {
	if (started) return;
	started = true;
	authTokenUnsubscribe ??= useAuthTokenStore.subscribe((state, previous) => {
		if (state.token !== previous.token) resetConnection();
	});
	// Run for the app's lifetime alongside the persistent socket; the module never tears down (the
	// socket is intentionally long-lived), so the timer is created once and left running.
	livenessTimer ??= setInterval(livenessTick, PING_INTERVAL_MS);
	connect();
}

export function useWebSocketSubscribe(listener: MessageListener): void {
	useEffect(() => {
		ensureStarted();
		messageListeners.add(listener);
		return () => {
			messageListeners.delete(listener);
		};
	}, [listener]);
}

export function useWebSocketReconnect(listener: ReconnectListener): void {
	useEffect(() => {
		ensureStarted();
		reconnectListeners.add(listener);
		return () => {
			reconnectListeners.delete(listener);
		};
	}, [listener]);
}

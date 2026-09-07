// Connection-liveness watchdog for the shared WebSocket (see useWebSocket.ts). A WebSocket whose
// underlying TCP connection drops without a clean FIN (laptop sleep, Wi-Fi blip, NAT/proxy idle
// timeout) can sit "half-open": readyState stays OPEN and no `close` event ever fires, so the
// standard close→retry path never runs and the live console freezes on its last line until a manual
// browser refresh. To detect this the transport pings on a fixed cadence — the backend acks any
// client frame — and treats the socket as dead when no frame at all (not even its own ack) has
// arrived within the staleness window, at which point it closes the socket so the existing reconnect
// path establishes a fresh one and refires the reconnect listeners.

export const PING_INTERVAL_MS = 25000;
export const LIVENESS_TIMEOUT_MS = 40000;

export type LivenessAction = 'idle' | 'ping' | 'reconnect';

// Pure decision for the liveness watchdog, extracted so it can be unit-tested without a live socket.
// A socket that is not OPEN is left alone (the connect/close/retry path owns those states). An OPEN
// socket that has been silent past `timeoutMs` is presumed half-open and must be reconnected;
// otherwise we probe it with a ping whose ack refreshes the silence clock.
export function evaluateLiveness(params: {
	isOpen: boolean;
	lastMessageAt: null | number;
	now: number;
	timeoutMs: number;
}): LivenessAction {
	if (!params.isOpen) return 'idle';
	if (params.lastMessageAt !== null && params.now - params.lastMessageAt > params.timeoutMs) {
		return 'reconnect';
	}
	return 'ping';
}

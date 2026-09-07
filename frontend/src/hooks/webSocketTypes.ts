// Incoming WebSocket frames are untrusted and can include a synthetic raw fallback, so this
// transport envelope intentionally stays looser than the backend's WebSocketEvent contract.
export interface SocketMessage {
	payload: unknown;
	runId?: string;
	type: string;
}

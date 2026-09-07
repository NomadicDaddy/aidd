import type { SocketMessage } from './webSocketTypes.ts';

import { summarizeValue } from '../lib/dataMovementTrace.ts';

// Compact, trace-only projection of a SocketMessage. Built solely to feed traceDataMovement when
// tracing is enabled (the hot run_output path skips it otherwise), so it keeps just the fields a
// data-movement trace cares about rather than echoing arbitrary wire payloads.
export type SocketMessageSummary = {
	bytes?: number;
	payload?: unknown;
	runId?: string;
	status?: string;
	stream?: string;
	type: string;
};

function payloadObject(payload: unknown): null | Record<string, unknown> {
	return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
		? (payload as Record<string, unknown>)
		: null;
}

function payloadString(payload: Record<string, unknown>, key: string): string | undefined {
	const value = payload[key];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function summarizeSocketMessage(message: SocketMessage): SocketMessageSummary {
	const payload = payloadObject(message.payload);
	const summary: SocketMessageSummary = {
		type: message.type,
	};
	if (message.runId) summary.runId = message.runId;
	if (message.type === 'run_output' && payload) {
		const chunk = payloadString(payload, 'chunk') ?? '';
		summary.bytes = chunk.length;
		const stream = payloadString(payload, 'stream');
		if (stream) summary.stream = stream;
		return summary;
	}
	if (message.type === 'run_status' && payload) {
		const status = payloadString(payload, 'status');
		if (status) summary.status = status;
		return summary;
	}
	if (message.type === 'connected' && payload) {
		if (payload.connected === true) summary.status = 'confirmed';
		return summary;
	}
	summary.payload = summarizeValue(message.payload);
	return summary;
}

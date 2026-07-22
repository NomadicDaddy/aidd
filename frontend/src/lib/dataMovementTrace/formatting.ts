import type { TraceRecord } from './types.ts';

import {
	HTTP_METHODS,
	LABEL_SUMMARY_KEYS,
	MAX_STRING_LENGTH,
	SENSITIVE_KEY_PATTERN,
} from './constants.ts';

export function numberValue(value: unknown): null | number {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function stringValue(value: unknown): null | string {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function scalarValue(value: unknown): null | string {
	if (typeof value === 'string') return value.trim() || null;
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	if (typeof value === 'boolean') return String(value);
	return null;
}

function recordValue(value: unknown): null | Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function traceMethod(source: string | undefined): null | string {
	if (!source) return null;
	const method = source.toUpperCase();
	return HTTP_METHODS.has(method) ? method : null;
}

function traceEndpoint(event: TraceRecord): null | string {
	return stringValue(event.target) ?? stringValue(event.summary?.route);
}

function traceDuration(event: TraceRecord): null | number {
	return numberValue(event.durationMs) ?? numberValue(event.summary?.durationMs);
}

function responseBytes(event: TraceRecord): null | number {
	const directBytes = numberValue(event.summary?.bytes);
	if (directBytes !== null) return directBytes;
	return numberValue(recordValue(event.summary?.body)?.bytes);
}

function formatDuration(value: number): string {
	return `${Math.round(value)}ms`;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${Math.round(bytes)} B`;
	const units = ['KB', 'MB', 'GB'];
	let value = bytes;
	for (const unit of units) {
		value = value / 1024;
		if (value < 1024 || unit === units[units.length - 1]) {
			return `${Number(value.toFixed(1))} ${unit}`;
		}
	}
	return `${Math.round(bytes)} B`;
}

function countEntries(summary: Record<string, unknown> | undefined): [string, number][] {
	const counts = recordValue(summary?.counts);
	if (!counts) return [];
	return Object.entries(counts)
		.map(([key, value]) => [key, numberValue(value)] as const)
		.filter((entry): entry is [string, number] => entry[1] !== null && entry[1] > 0);
}

function backendEventCount(summary: Record<string, unknown> | undefined): null | number {
	const counts = countEntries(summary);
	if (counts.length > 0) {
		return counts.reduce((total, [, count]) => total + count, 0);
	}
	const events = summary?.events;
	return Array.isArray(events) ? events.length : null;
}

function formatBackendLabel(event: TraceRecord, method: string, endpoint: string): string {
	const parts = [`${method} ${endpoint}`, 'backend'];
	const durationMs = traceDuration(event);
	if (durationMs !== null) parts.push(formatDuration(durationMs));
	const eventCount = backendEventCount(event.summary);
	if (eventCount !== null) parts.push('events', String(Math.round(eventCount)));
	for (const [key, count] of countEntries(event.summary)) {
		parts.push(`${key}:${Math.round(count)}`);
	}
	return parts.join(' ');
}

function endpointTraceLabel(event: TraceRecord): null | string {
	const method = traceMethod(event.source);
	const endpoint = traceEndpoint(event);
	if (!method || !endpoint) return null;
	if (event.layer === 'api' && event.operation === 'api.request') {
		return `${method} ${endpoint} request`;
	}
	if (
		event.layer === 'api' &&
		(event.operation === 'api.response' || event.operation === 'api.error')
	) {
		const parts = [`${method} ${endpoint}`];
		if (event.status) parts.push(event.status);
		const durationMs = traceDuration(event);
		if (durationMs !== null) parts.push(formatDuration(durationMs));
		parts.push(event.operation === 'api.error' ? 'error' : 'response');
		const bytes = responseBytes(event);
		if (bytes !== null) parts.push(formatBytes(bytes));
		return parts.join(' ');
	}
	if (event.layer === 'backend' && event.operation === 'request.summary') {
		return formatBackendLabel(event, method, endpoint);
	}
	return null;
}

function fallbackSummaryParts(summary: Record<string, unknown> | undefined): string[] {
	if (!summary) return [];
	const parts: string[] = [];
	for (const key of LABEL_SUMMARY_KEYS) {
		if (SENSITIVE_KEY_PATTERN.test(key)) continue;
		const value = scalarValue(summary[key]);
		if (value) parts.push(`${key}=${value.slice(0, MAX_STRING_LENGTH)}`);
	}
	return parts.slice(0, 3);
}

function socketMessageTraceLabel(event: TraceRecord): null | string {
	if (event.layer !== 'socket' || event.operation !== 'socket.message') return null;
	const summary = event.summary;
	const type = stringValue(summary?.type) ?? 'unknown';
	const parts = ['socket', type];
	const runId = stringValue(summary?.runId);
	if (runId) parts.push(`runId=${runId}`);
	const status = stringValue(summary?.status);
	if (status) parts.push(`status=${status}`);
	const stream = stringValue(summary?.stream);
	if (stream) parts.push(`stream=${stream}`);
	const bytes = numberValue(summary?.bytes);
	if (bytes !== null) parts.push(`chunk=${formatBytes(bytes)}`);
	return `[aidd] ${parts.join(' ')}`;
}

export function formatTraceLabel(event: TraceRecord): string {
	const endpointLabel = endpointTraceLabel(event);
	const socketLabel = socketMessageTraceLabel(event);
	if (socketLabel) return socketLabel;
	const root = endpointLabel ?? `${event.layer}.${event.operation}`;
	const fallbackParts = endpointLabel ? [] : fallbackSummaryParts(event.summary);
	return `[aidd] ${[root, ...fallbackParts].join(' ')}`;
}

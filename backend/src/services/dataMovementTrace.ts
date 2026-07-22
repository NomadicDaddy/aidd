import { AsyncLocalStorage } from 'node:async_hooks';
import { basename, sep } from 'node:path';

export type DataMovementCategory =
	'database' | 'event' | 'file' | 'metadata' | 'request' | 'response';

export interface BackendDataMovementTraceEvent {
	category: DataMovementCategory;
	durationMs?: number;
	operation: string;
	source?: string;
	status?: string;
	summary?: Record<string, unknown>;
	target?: string;
	timestamp?: string;
}

interface TraceContext {
	events: BackendDataMovementTraceEvent[];
	startedAt: number;
	traceId: string;
}

const MAX_EVENTS = 32;
const MAX_HEADER_CHARS = 7000;
const MAX_KEYS = 16;
const MAX_STRING_LENGTH = 120;
const SENSITIVE_KEY_PATTERN =
	/(authorization|bearer|cookie|credential|jwt|key|password|private|secret|session|token)/i;

const storage = new AsyncLocalStorage<null | TraceContext>();

export function beginDataMovementTrace(traceId: string): void {
	storage.enterWith({ events: [], startedAt: performance.now(), traceId });
}

export function disableDataMovementTrace(): void {
	storage.enterWith(null);
}

export function currentDataMovementTraceId(): null | string {
	return storage.getStore()?.traceId ?? null;
}

export function recordDataMovement(event: BackendDataMovementTraceEvent): void {
	const context = storage.getStore();
	if (!context) return;
	context.events.push(sanitizeEvent(event));
}

function sanitizeEvent(event: BackendDataMovementTraceEvent): BackendDataMovementTraceEvent {
	const sanitized: BackendDataMovementTraceEvent = {
		category: event.category,
		operation: event.operation,
		timestamp: event.timestamp ?? new Date().toISOString(),
	};
	if (event.durationMs !== undefined) sanitized.durationMs = event.durationMs;
	if (event.source) sanitized.source = safeTraceTarget(event.source);
	if (event.status !== undefined) sanitized.status = event.status;
	if (event.summary) sanitized.summary = sanitizeObject(event.summary);
	if (event.target) sanitized.target = safeTraceTarget(event.target);
	return sanitized;
}

function sanitizeObject(value: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const key of Object.keys(value).slice(0, MAX_KEYS)) {
		result[key] = SENSITIVE_KEY_PATTERN.test(key)
			? '[redacted]'
			: summarizeTraceValue(value[key], 1);
	}
	return result;
}

export function summarizeTraceValue(value: unknown, depth = 0): unknown {
	if (value === null || value === undefined) return value;
	if (typeof value === 'boolean' || typeof value === 'number') return value;
	if (typeof value === 'string') {
		return {
			length: value.length,
			preview:
				value.length > MAX_STRING_LENGTH
					? `${value.slice(0, MAX_STRING_LENGTH)}...`
					: value,
			type: 'string',
		};
	}
	if (depth > 1) return { type: Array.isArray(value) ? 'array' : typeof value };
	if (Array.isArray(value)) {
		return {
			length: value.length,
			type: 'array',
		};
	}
	if (typeof value === 'object') {
		const record = value as Record<string, unknown>;
		const keys = Object.keys(record);
		const result: Record<string, unknown> = {
			keyCount: keys.length,
			keys: keys.slice(0, MAX_KEYS),
			type: 'object',
		};
		for (const idKey of ['id', 'projectId', 'runId', 'recipeId', 'sessionId', 'featureId']) {
			const idValue = record[idKey];
			if (typeof idValue === 'string' || typeof idValue === 'number') result[idKey] = idValue;
		}
		return result;
	}
	return { type: typeof value };
}

export function safeTraceTarget(path: string): string {
	const normalized = path.replaceAll('\\', '/');
	const aiddIndex = normalized.lastIndexOf('/.aidd/');
	if (aiddIndex >= 0) {
		const relative = normalized.slice(aiddIndex + 1);
		return relative.replace(
			/\.aidd\/features\/[^/]+\/feature\.json$/,
			'.aidd/features/<feature>/feature.json'
		);
	}
	if (normalized.includes('://')) {
		try {
			const url = new URL(normalized);
			return url.pathname;
		} catch {
			return '<url>';
		}
	}
	if (/^[A-Za-z]:\//.test(normalized) || path.includes(sep)) {
		return basename(normalized);
	}
	return normalized;
}

function eventCounts(events: BackendDataMovementTraceEvent[]): Record<string, number> {
	return events.reduce<Record<string, number>>((counts, event) => {
		counts[event.category] = (counts[event.category] ?? 0) + 1;
		return counts;
	}, {});
}

export function dataMovementTraceHeader(): string {
	const context = storage.getStore();
	if (!context) return JSON.stringify({ events: [], traceId: null });
	const events = context.events.slice(0, MAX_EVENTS);
	const payload = {
		counts: eventCounts(context.events),
		durationMs: Math.round(performance.now() - context.startedAt),
		events,
		traceId: context.traceId,
		truncated: context.events.length > MAX_EVENTS,
	};
	const encoded = JSON.stringify(payload);
	if (encoded.length <= MAX_HEADER_CHARS) return encoded;
	return JSON.stringify({
		counts: eventCounts(context.events),
		durationMs: Math.round(performance.now() - context.startedAt),
		traceId: context.traceId,
		truncated: true,
	});
}

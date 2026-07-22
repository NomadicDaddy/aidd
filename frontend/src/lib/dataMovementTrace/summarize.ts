import {
	MAX_ARRAY_ITEMS,
	MAX_KEYS,
	MAX_STRING_LENGTH,
	SENSITIVE_KEY_PATTERN,
} from './constants.ts';

function summarizeString(value: string): Record<string, unknown> {
	return {
		length: value.length,
		preview:
			value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value,
		type: 'string',
	};
}

function summarizeObject(value: Record<string, unknown>): Record<string, unknown> {
	const keys = Object.keys(value);
	const summary: Record<string, unknown> = {
		keyCount: keys.length,
		keys: keys.slice(0, MAX_KEYS),
		type: 'object',
	};

	for (const idKey of ['id', 'projectId', 'runId', 'recipeId', 'sessionId', 'featureId']) {
		const idValue = value[idKey];
		if (typeof idValue === 'string' || typeof idValue === 'number') {
			summary[idKey] = idValue;
		}
	}

	const fields: Record<string, unknown> = {};
	for (const key of keys.slice(0, MAX_KEYS)) {
		const nextValue = value[key];
		fields[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : summarizeValue(nextValue, 1);
	}
	summary.fields = fields;
	return summary;
}

export function summarizeValue(value: unknown, depth = 0): unknown {
	if (value === null || value === undefined) return value;
	if (typeof value === 'boolean' || typeof value === 'number') return value;
	if (typeof value === 'string') return summarizeString(value);
	if (depth > 1) return { type: Array.isArray(value) ? 'array' : typeof value };
	if (Array.isArray(value)) {
		return {
			length: value.length,
			sample: value.slice(0, MAX_ARRAY_ITEMS).map((item) => summarizeValue(item, depth + 1)),
			type: 'array',
		};
	}
	if (typeof value === 'object') return summarizeObject(value as Record<string, unknown>);
	return { type: typeof value };
}

export function summarizeBody(value: unknown): Record<string, unknown> {
	const jsonLength = value === undefined ? 0 : JSON.stringify(value).length;
	return {
		bytes: jsonLength,
		value: summarizeValue(value),
	};
}

export function parseBackendTraceHeader(value: null | string): null | Record<string, unknown> {
	if (!value) return null;
	try {
		const parsed = JSON.parse(value) as unknown;
		return typeof parsed === 'object' && parsed !== null
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return { parseError: true };
	}
}

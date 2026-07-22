export const TRACE_STORAGE_KEY = 'aidd.traceDataMovement';
export const TRACE_QUERY_PARAM = 'traceData';
export const MAX_KEYS = 16;
export const MAX_ARRAY_ITEMS = 5;
export const MAX_STRING_LENGTH = 120;
export const HTTP_METHODS = new Set(['DELETE', 'GET', 'PATCH', 'POST', 'PUT']);
export const LABEL_SUMMARY_KEYS = [
	'projectId',
	'runId',
	'featureId',
	'recipeId',
	'sessionId',
	'id',
	'tab',
] as const;
export const SENSITIVE_KEY_PATTERN =
	/(authorization|bearer|cookie|credential|jwt|key|password|private|secret|session|token)/i;

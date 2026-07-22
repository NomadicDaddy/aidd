import type { RunLaunchRequest } from '../../../types.ts';
import type { WebRunMode } from '../../../types/run.ts';

const maxToolResultChars = 12_000;

/**
 * Valid run modes accepted by the Director chat launch_run tool. Matches the
 * ck_runs_mode DB constraint and the WebRunMode type. Kept as a runtime Set so
 * the mode is validated against an explicit allowlist rather than cast from a
 * raw string.
 */
const ALLOWED_RUN_MODES: ReadonlySet<WebRunMode> = new Set<WebRunMode>([
	'audit',
	'coding',
	'directive',
	'director',
	'interview',
	'todo',
	'triumvirate',
	'validate',
]);

export function asArgs(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function requireString(args: Record<string, unknown>, key: string): string {
	const value = args[key];
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`Missing required string argument: ${key}`);
	}
	return value;
}

export function optionalString(args: Record<string, unknown>, key: string): string | undefined {
	const value = args[key];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
	const value = args[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function buildLaunchInput(args: Record<string, unknown>): RunLaunchRequest {
	const input: RunLaunchRequest = { projectDir: requireString(args, 'projectDir') };
	const mode = optionalString(args, 'mode');
	if (mode !== undefined) {
		if (!ALLOWED_RUN_MODES.has(mode as WebRunMode)) {
			throw new Error(
				`Invalid run mode: ${mode}. Allowed modes: ${[...ALLOWED_RUN_MODES].join(', ')}`
			);
		}
		input.mode = mode as WebRunMode;
	}
	const feature = optionalString(args, 'feature');
	if (feature !== undefined) input.feature = feature;
	const prompt = optionalString(args, 'prompt');
	if (prompt !== undefined) input.prompt = prompt;
	const backend = optionalString(args, 'backend');
	if (backend !== undefined) input.backend = backend as NonNullable<RunLaunchRequest['backend']>;
	const model = optionalString(args, 'model');
	if (model !== undefined) input.model = model;
	const reasoningEffort = optionalString(args, 'reasoningEffort');
	if (reasoningEffort !== undefined) input.reasoningEffort = reasoningEffort;
	const maxIterations = optionalNumber(args, 'maxIterations');
	if (maxIterations !== undefined) input.maxIterations = maxIterations;
	return input;
}

export function truncate(text: string): string {
	return text.length > maxToolResultChars
		? `${text.slice(0, maxToolResultChars)}\n\n... OUTPUT TRUNCATED (${text.length} chars total)`
		: text;
}

export function jsonResult(value: unknown): string {
	return truncate(JSON.stringify(value, null, 2));
}

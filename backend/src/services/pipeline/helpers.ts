import { type BackendName, normalizeBackendName } from 'aidd-shared/plan/types';
import { basename } from 'node:path';

import type { RecipeConfigValue, RecipeDefinition, RunLaunchRequest } from '../../types.ts';

import { managedStepTypes } from './types.ts';

export function createPipelineSessionId(): string {
	return `pipe_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

export function createPipelineStepResultId(): string {
	return `step_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

export function isActiveSessionStatus(status: string): boolean {
	return status === 'queued' || status === 'running';
}

export function isManagedStepType(stepType: string): boolean {
	return managedStepTypes.has(stepType);
}

const OUTPUT_SUMMARY_MAX_CHARS = 4000;

export function formatOutputSummary(stdout: string, stderr: string): string {
	const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
	if (output.length <= OUTPUT_SUMMARY_MAX_CHARS) return output;
	return output.slice(output.length - OUTPUT_SUMMARY_MAX_CHARS);
}

export function stringifyError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

const FAILURE_NARRATIVE_MAX = 500;

// Best available failure narrative for a run: blocked/no-work/stopped outcomes record their
// cause in `summary` (and aiSummary), leaving `errorMessage` null. Prefer those fields over a
// generic status message, matching cycleExecutor.readRunFailureReason.
export function runFailureNarrative(run: {
	aiSummary: null | string;
	errorMessage: null | string;
	status: string;
	summary: null | string;
}): string {
	const error = run.errorMessage?.trim();
	if (error) return error;
	const summary = run.summary?.trim();
	if (summary) return summary;
	const ai = run.aiSummary?.trim();
	if (ai)
		return ai.length > FAILURE_NARRATIVE_MAX ? `${ai.slice(0, FAILURE_NARRATIVE_MAX)}…` : ai;
	return `Run finished with status ${run.status}`;
}

// Parse a persisted session parameters_json blob back into a flat string map, tolerating
// malformed or non-object JSON (returns an empty map). Used when resuming a session.
export function parseSessionParameters(parametersJson: string): Record<string, string> {
	try {
		const parsed = JSON.parse(parametersJson) as unknown;
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
		const out: Record<string, string> = {};
		for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
			if (typeof value === 'string') out[key] = value;
		}
		return out;
	} catch {
		return {};
	}
}

export function configString(
	config: Record<string, RecipeConfigValue>,
	key: string,
): string | undefined {
	const value = config[key];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function configBoolean(config: Record<string, RecipeConfigValue>, key: string): boolean {
	return config[key] === true;
}

function configNumber(config: Record<string, RecipeConfigValue>, key: string): number | undefined {
	const value = config[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function configStringRecord(
	config: Record<string, RecipeConfigValue>,
	key: string,
): Record<string, string> {
	const value = config[key];
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
	const output: Record<string, string> = {};
	for (const [entryKey, entryValue] of Object.entries(value)) {
		if (typeof entryValue === 'string') output[entryKey] = entryValue;
	}
	return output;
}

function configStringList(
	config: Record<string, RecipeConfigValue>,
	key: string,
): string[] | undefined {
	const value = config[key];
	if (typeof value === 'string') {
		return value
			.split(',')
			.map((entry) => entry.trim())
			.filter(Boolean);
	}
	if (!Array.isArray(value)) return undefined;
	const entries = value.filter((entry): entry is string => typeof entry === 'string');
	return entries.length > 0 ? entries : undefined;
}

function configBackend(
	config: Record<string, RecipeConfigValue>,
	key: string,
): BackendName | undefined {
	const value = config[key];
	return typeof value === 'string' ? normalizeBackendName(value) : undefined;
}

function substituteValue(
	value: RecipeConfigValue,
	parameters: Record<string, string>,
): RecipeConfigValue {
	if (typeof value === 'string') {
		return value.replace(/\{([a-zA-Z0-9_-]+)\}/g, (match, key: string) => {
			return parameters[key] ?? match;
		});
	}
	if (Array.isArray(value)) return value.map((entry) => substituteValue(entry, parameters));
	if (typeof value !== 'object' || value === null) return value;
	const output: Record<string, RecipeConfigValue> = {};
	for (const [key, entry] of Object.entries(value)) {
		output[key] = substituteValue(entry, parameters);
	}
	return output;
}

export function substituteConfig(
	config: Record<string, RecipeConfigValue>,
	parameters: Record<string, string>,
): Record<string, RecipeConfigValue> {
	const output: Record<string, RecipeConfigValue> = {};
	for (const [key, value] of Object.entries(config)) {
		output[key] = substituteValue(value, parameters);
	}
	return output;
}

export function resolveParameters(input: {
	parameters?: Record<string, string> | undefined;
	projectDir: string;
	recipe: RecipeDefinition;
}): Record<string, string> {
	const projectName = basename(input.projectDir);
	const resolved: Record<string, string> = {
		application: projectName,
		projectDir: input.projectDir,
		projectName,
		...(input.parameters ?? {}),
	};
	for (const parameter of input.recipe.parameters) {
		if (resolved[parameter.name] !== undefined) continue;
		if (parameter.defaultValue !== undefined) {
			resolved[parameter.name] = parameter.defaultValue;
			continue;
		}
		throw new Error(`Missing required recipe parameter: ${parameter.name}`);
	}
	return resolved;
}

export function requestFromAiddCliStep(input: {
	config: Record<string, RecipeConfigValue>;
	pipelineSessionId: string;
	projectDir: string;
}): RunLaunchRequest {
	const request: RunLaunchRequest = {
		pipelineSessionId: input.pipelineSessionId,
		projectDir: input.projectDir,
	};
	// `backend` matches launch routes and skill steps; `cliType` remains readable
	// for older custom recipes created before launch-target overrides.
	const backend =
		configBackend(input.config, 'backend') ?? configBackend(input.config, 'cliType');
	const auditNames = configStringList(input.config, 'auditNames');
	const maxIterations = configNumber(input.config, 'maxIterations');
	const writeAllowlist = configStringList(input.config, 'writeAllowlist');
	if (backend !== undefined) request.backend = backend;
	const model = configString(input.config, 'model');
	if (model !== undefined) request.model = model;
	const reasoningEffort = configString(input.config, 'reasoningEffort');
	if (reasoningEffort !== undefined) request.reasoningEffort = reasoningEffort;
	if (auditNames !== undefined) request.auditNames = auditNames;
	if (configBoolean(input.config, 'auditAll')) request.auditAll = true;
	if (configBoolean(input.config, 'checkArtifacts')) request.checkArtifacts = true;
	if (configBoolean(input.config, 'interview')) request.interview = true;
	if (configBoolean(input.config, 'validate')) request.validate = true;
	const triumvirate = configBoolean(input.config, 'triumvirate');
	if (maxIterations !== undefined) request.maxIterations = maxIterations;
	if (writeAllowlist !== undefined) request.writeAllowlist = writeAllowlist;
	const filterBy = configString(input.config, 'filterBy');
	const filterValue = configString(input.config, 'filterValue');
	const feature = configString(input.config, 'feature');
	const prompt = configString(input.config, 'prompt');
	if (filterBy !== undefined) request.filterBy = filterBy;
	if (filterValue !== undefined) request.filterValue = filterValue;
	if (feature !== undefined) request.feature = feature;
	if (prompt !== undefined) request.prompt = prompt;
	if (request.validate) {
		request.mode = 'validate';
	} else if (request.interview) {
		request.mode = 'interview';
	} else if (request.auditAll || request.auditNames !== undefined) {
		request.mode = 'audit';
	} else if (triumvirate) {
		request.mode = 'triumvirate';
	} else if (prompt !== undefined) {
		// A prompt step is a directive: run the prompt verbatim without auto-selecting
		// or claiming a backlog feature. Matches the CLI mode resolution in resolve.ts
		// and keeps the persisted run mode accurate.
		request.mode = 'directive';
	} else {
		request.mode = 'coding';
	}
	return request;
}

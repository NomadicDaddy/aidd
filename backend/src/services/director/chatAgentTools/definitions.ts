import type { ToolDefinition } from 'aidd-shared/agent/client';

import { toolDefinitions as fileToolDefinitions } from 'aidd-shared/agent/tools/index';

export const fileToolNames = new Set(fileToolDefinitions.map((tool) => tool.function.name));
export const mutatingFileToolNames = new Set(['bash', 'edit_file', 'write_file']);

const projectIdDescription = 'Project id (base64url-encoded path or the project folder name).';

const runIdParams = {
	properties: { runId: { description: 'Run identifier.', type: 'string' } },
	required: ['runId'],
	type: 'object',
} as const;

const orchestrateToolDefinitions: ToolDefinition[] = [
	fn('list_projects', 'List all aidd-discovered projects with feature stats and health.', {
		properties: {},
		type: 'object',
	}),
	fn('get_project', 'Get full detail for one project, including its features and maturity.', {
		properties: {
			projectId: {
				description: projectIdDescription,
				type: 'string',
			},
		},
		required: ['projectId'],
		type: 'object',
	}),
	fn('get_fleet_summary', 'Get the aggregated fleet summary the Director reasons over.', {
		properties: {},
		type: 'object',
	}),
	fn(
		'get_recipe',
		'Get the exact definition of a recipe before describing or launching recipe-backed work.',
		{
			properties: {
				recipeId: { description: 'Recipe id from the recipe catalog.', type: 'string' },
			},
			required: ['recipeId'],
			type: 'object',
		},
	),
	fn(
		'launch_run',
		'Launch a supervised run for a project (coding by default) and return the run record. This is how you make code changes — never edit files yourself unless explicitly told you may.',
		{
			properties: {
				backend: {
					description: 'Backend/CLI to use (e.g. native, cline, codex).',
					type: 'string',
				},
				feature: {
					description: 'Feature directory/id to scope the run to.',
					type: 'string',
				},
				maxIterations: { description: 'Maximum orchestrator iterations.', type: 'number' },
				mode: {
					description: 'Run mode (default coding).',
					enum: ['audit', 'coding', 'interview', 'todo', 'triumvirate', 'validate'],
					type: 'string',
				},
				model: { description: 'Model override.', type: 'string' },
				projectDir: {
					description: 'Absolute path to the project directory.',
					type: 'string',
				},
				prompt: {
					description:
						'Custom directive prompt. Do not use this to simulate an existing recipe; launch its matching suggestion or report the recipe launch route.',
					type: 'string',
				},
				reasoningEffort: { description: 'Reasoning effort hint.', type: 'string' },
			},
			required: ['projectDir'],
			type: 'object',
		},
	),
	fn('get_run', 'Get a single run record by id.', runIdParams),
	fn('run_output', 'Read the captured output for a run.', runIdParams),
	fn('stop_run', 'Request a graceful stop of a running run.', runIdParams),
	fn('kill_run', 'Forcefully terminate a running run.', runIdParams),
	fn('list_suggestions', 'List Director suggestions (pending, launched, dismissed).', {
		properties: {},
		type: 'object',
	}),
	fn(
		'launch_suggestion',
		'Launch a project-scoped Director suggestion using its exact recipe or run directive.',
		{
			properties: { suggestionId: { description: 'Suggestion id.', type: 'string' } },
			required: ['suggestionId'],
			type: 'object',
		},
	),
	fn('dismiss_suggestion', 'Dismiss a Director suggestion.', {
		properties: { suggestionId: { description: 'Suggestion id.', type: 'string' } },
		required: ['suggestionId'],
		type: 'object',
	}),
	fn(
		'run_cycle',
		'Start a Director cycle in the background and return its id immediately. A completion message is posted to this chat when it finishes.',
		{
			properties: {
				directive: {
					description: 'Optional directive to focus the cycle.',
					type: 'string',
				},
			},
			type: 'object',
		},
	),
];

function fn(name: string, description: string, parameters: unknown): ToolDefinition {
	return { function: { description, name, parameters }, type: 'function' };
}

/**
 * The tools offered to the model. File-editing tools are only included when the operator has opted
 * in, so the model literally cannot see (and the dispatcher additionally cannot run) them by default.
 * @param allowFileEdits
 * @returns The tool definitions available to the model.
 */
export function buildToolDefinitions(allowFileEdits: boolean): ToolDefinition[] {
	if (!allowFileEdits) return orchestrateToolDefinitions;
	const projectScopedFileTools = fileToolDefinitions.map((tool) => withRequiredProjectId(tool));
	return [...orchestrateToolDefinitions, ...projectScopedFileTools];
}

function withRequiredProjectId(tool: ToolDefinition): ToolDefinition {
	const params = (tool.function.parameters ?? {}) as {
		properties?: Record<string, unknown>;
		required?: string[];
		type?: string;
	};
	return fn(tool.function.name, tool.function.description, {
		properties: {
			projectId: {
				description: projectIdDescription,
				type: 'string',
			},
			...(params.properties ?? {}),
		},
		required: ['projectId', ...(params.required ?? [])],
		type: 'object',
	});
}

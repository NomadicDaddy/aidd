import type { AiddApiClient } from '../channels/apiClient.ts';

/**
 * aidd MCP tool catalog. Every tool is a thin wrapper over an existing web API route via the
 * shared {@link AiddApiClient}; no new backend behavior is introduced here. JSON Schema (not Zod)
 * describes tool inputs so this module stays decoupled from the SDK's own validation library
 * version. The dispatcher and SDK server wiring live in server.ts.
 */

export interface JsonSchema {
	properties: Record<string, unknown>;
	required?: string[];
	type: 'object';
}

export interface ChatState {
	sessionId: string | undefined;
}

export interface ToolDefinition {
	description: string;
	handler: (
		client: AiddApiClient,
		args: Record<string, unknown>,
		state: ChatState,
	) => Promise<unknown>;
	inputSchema: JsonSchema;
	name: string;
}

export function asArgs(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function requireString(args: Record<string, unknown>, key: string): string {
	const value = args[key];
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`Missing required string argument: ${key}`);
	}
	return value;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
	const value = args[key];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
	const value = args[key];
	return typeof value === 'boolean' ? value : undefined;
}

function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
	const value = args[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function buildLaunchBody(args: Record<string, unknown>): Record<string, unknown> {
	const body: Record<string, unknown> = { projectDir: requireString(args, 'projectDir') };
	for (const key of ['mode', 'feature', 'prompt', 'backend', 'model', 'reasoningEffort']) {
		const value = optionalString(args, key);
		if (value !== undefined) body[key] = value;
	}
	const simulation = optionalBoolean(args, 'simulation');
	if (simulation !== undefined) body.simulation = simulation;
	const maxIterations = optionalNumber(args, 'maxIterations');
	if (maxIterations !== undefined) body.maxIterations = maxIterations;
	return body;
}

const runIdSchema: JsonSchema = {
	properties: { runId: { description: 'Run identifier.', type: 'string' } },
	required: ['runId'],
	type: 'object',
};

export const TOOLS: ToolDefinition[] = [
	{
		description: 'List all aidd-discovered projects with feature stats and health.',
		handler: (client) => client.get('/api/v1/projects'),
		inputSchema: { properties: {}, type: 'object' },
		name: 'list_projects',
	},
	{
		description: 'Get full detail for one project, including its features and maturity.',
		handler: (client, args) =>
			client.get(`/api/v1/projects/${encodeURIComponent(requireString(args, 'projectId'))}`),
		inputSchema: {
			properties: {
				projectId: {
					description: 'Project id (base64url-encoded path or the project folder name).',
					type: 'string',
				},
			},
			required: ['projectId'],
			type: 'object',
		},
		name: 'get_project',
	},
	{
		description:
			'Launch a run for a project (coding by default) and return the created run record.',
		handler: (client, args) => client.post('/api/v1/runs', buildLaunchBody(args)),
		inputSchema: {
			properties: {
				backend: {
					description: 'Backend/CLI to use (e.g. native, claude-code, codex, opencode).',
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
				prompt: { description: 'Custom directive prompt.', type: 'string' },
				reasoningEffort: { description: 'Reasoning effort hint.', type: 'string' },
				simulation: {
					description: 'Run in simulation mode without invoking a real backend.',
					type: 'boolean',
				},
			},
			required: ['projectDir'],
			type: 'object',
		},
		name: 'launch_run',
	},
	{
		description: 'Get a single run record by id.',
		handler: (client, args) =>
			client.get(`/api/v1/runs/${encodeURIComponent(requireString(args, 'runId'))}`),
		inputSchema: runIdSchema,
		name: 'get_run',
	},
	{
		description: 'Read the captured output for a run.',
		handler: (client, args) =>
			client.get(`/api/v1/runs/${encodeURIComponent(requireString(args, 'runId'))}/output`),
		inputSchema: runIdSchema,
		name: 'run_output',
	},
	{
		description: 'Request a graceful stop of a running run.',
		handler: (client, args) =>
			client.post(`/api/v1/runs/${encodeURIComponent(requireString(args, 'runId'))}/stop`),
		inputSchema: runIdSchema,
		name: 'stop_run',
	},
	{
		description: 'Forcefully terminate a running run.',
		handler: (client, args) =>
			client.post(`/api/v1/runs/${encodeURIComponent(requireString(args, 'runId'))}/kill`),
		inputSchema: runIdSchema,
		name: 'kill_run',
	},
	{
		description: 'List Director suggestions (pending, launched, dismissed).',
		handler: (client) => client.get('/api/v1/director/suggestions'),
		inputSchema: { properties: {}, type: 'object' },
		name: 'list_suggestions',
	},
	{
		description: 'Launch a Director suggestion using its exact recipe or run directive.',
		handler: (client, args) =>
			client.post(
				`/api/v1/director/suggestions/${encodeURIComponent(requireString(args, 'suggestionId'))}/launch`,
			),
		inputSchema: {
			properties: { suggestionId: { description: 'Suggestion id.', type: 'string' } },
			required: ['suggestionId'],
			type: 'object',
		},
		name: 'launch_suggestion',
	},
	{
		description: 'Start a Director cycle and return its output.',
		handler: (client, args) => {
			const body: Record<string, unknown> = {};
			const directive = optionalString(args, 'directive');
			if (directive !== undefined) body.directive = directive;
			const sessionId = optionalString(args, 'sessionId');
			if (sessionId !== undefined) body.sessionId = sessionId;
			return client.post('/api/v1/director/cycles', body);
		},
		inputSchema: {
			properties: {
				directive: { description: 'Optional directive for the cycle.', type: 'string' },
				sessionId: { description: 'Optional chat session id for context.', type: 'string' },
			},
			type: 'object',
		},
		name: 'run_cycle',
	},
	{
		description:
			'Send a message to the Director chat and get its reply. Chat is an autonomous agent that may inspect the fleet and orchestrate work (launch runs, start cycles, act on suggestions). Reuses one session per server unless a sessionId is given.',
		handler: async (client, args, state) => {
			const message = requireString(args, 'message');
			let sessionId = optionalString(args, 'sessionId') ?? state.sessionId;
			if (!sessionId) {
				const created = await client.post<{ session: { id: string } }>(
					'/api/v1/director/chat/sessions',
					{ title: 'MCP chat' },
				);
				sessionId = created.session.id;
				state.sessionId = sessionId;
			}
			const result = await client.post<{ messages: { assistant: { content: string } } }>(
				`/api/v1/director/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
				{ content: message },
			);
			return { reply: result.messages.assistant.content, sessionId };
		},
		inputSchema: {
			properties: {
				message: { description: 'Message to send to the Director.', type: 'string' },
				sessionId: {
					description:
						'Existing chat session id; omit to reuse/create the default session.',
					type: 'string',
				},
			},
			required: ['message'],
			type: 'object',
		},
		name: 'director_chat',
	},
];

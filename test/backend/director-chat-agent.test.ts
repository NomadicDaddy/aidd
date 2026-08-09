import { describe, expect, test } from 'bun:test';
import type { OpenAICompatibleClientConfig } from 'aidd-shared/agent/client';
import type { DirectorChatMessageRecord } from 'aidd-shared';
import {
	buildAgenticPreamble,
	DirectorChatAgent,
	NoToolCallingProviderError,
} from '../../backend/src/services/director/chatAgent.ts';
import type { ChatAgentToolContext } from '../../backend/src/services/director/chatAgentTools.ts';
import type { FleetSummary, ProfileRow } from '../../backend/src/services/director/types.ts';

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

function toolCallChunk(name: string, args: Record<string, unknown>): unknown {
	return {
		choices: [
			{
				message: {
					content: '',
					tool_calls: [
						{ id: 'call_1', function: { name, arguments: JSON.stringify(args) } },
					],
				},
			},
		],
	};
}

function finalChunk(content: string): unknown {
	return { choices: [{ message: { content } }] };
}

const profile: ProfileRow = {
	backend: 'native',
	createdAt: 0,
	id: 'default',
	instructions: '',
	model: null,
	reasoningEffort: 'low',
	role: 'Fleet Director',
	updatedAt: 0,
};

const fleetSummary = { projects: [] } as unknown as FleetSummary;

function userMessage(content: string): DirectorChatMessageRecord {
	return {
		actions: [],
		content,
		createdAt: 0,
		cycleId: null,
		id: 'm1',
		role: 'user',
		sessionId: 's1',
	};
}

function stubContext(overrides: Partial<ChatAgentToolContext> = {}): ChatAgentToolContext {
	return {
		dismissSuggestion: async () => {},
		getFleetSummary: async () => ({}),
		getProjectDetail: async () => ({}),
		getRecipe: async () => ({}),
		getRun: async () => ({}),
		killRun: async () => {},
		launchRun: async () => ({ id: 'run_1', mode: 'coding', projectName: 'demo' }),
		launchSuggestion: async (id) => ({ id, runId: 'run_2' }),
		listProjects: async () => ({ projects: [] }),
		listSuggestions: async () => [],
		readRunOutput: async () => ({}),
		resolveProjectPath: async (path) => path,
		startCycle: async () => ({ cycleId: 'cycle_1' }),
		stopRun: async () => {},
		...overrides,
	};
}

function clientConfigWith(responses: unknown[]): () => OpenAICompatibleClientConfig {
	let index = 0;
	return () => ({
		provider: 'test',
		baseUrl: 'https://provider.example/v1',
		model: 'test-model',
		stream: false,
		fetch: async () => {
			const body = responses[Math.min(index, responses.length - 1)];
			index += 1;
			return jsonResponse(body);
		},
	});
}

describe('DirectorChatAgent', () => {
	test('uses the Direct AI client model instead of the Director CLI model', async () => {
		let requestedModel: unknown;
		const agent = new DirectorChatAgent({
			resolveClient: () => ({
				baseUrl: 'https://provider.example/v1',
				fetch: async (_input, init) => {
					const body = JSON.parse(String(init?.body)) as { model?: unknown };
					requestedModel = body.model;
					return jsonResponse(finalChunk('Provider-specific reply.'));
				},
				model: 'glm-5.2',
				provider: 'zhipu',
				stream: false,
			}),
			toolContext: stubContext(),
		});

		const result = await agent.runTurn({
			allowFileEdits: false,
			fleetSummary,
			messages: [userMessage('Are you there?')],
			profile: { ...profile, model: 'gpt-5.6-terra' },
			sessionId: 's1',
		});

		expect(result.text).toBe('Provider-specific reply.');
		expect(requestedModel).toBe('glm-5.2');
	});

	test('grounds recipe claims in the catalog and exact recipe inspection', () => {
		const preamble = buildAgenticPreamble({
			allowFileEdits: false,
			fleetSummary,
			messages: [userMessage('What does check-artifacts do?')],
			profile,
			recipeCatalog: [
				{
					description: 'Validates artifact status; it does not edit artifacts.',
					id: 'check-artifacts',
					name: 'check-artifacts',
				},
			],
			sessionId: 's1',
		});

		expect(preamble).toContain('Never infer recipe behavior from its name');
		expect(preamble).toContain('call get_recipe for the exact steps');
		expect(preamble).toContain('Validates artifact status; it does not edit artifacts.');
	});

	test('runs a tool call then returns the final reply with an action trail', async () => {
		let launched = 0;
		const agent = new DirectorChatAgent({
			resolveClient: clientConfigWith([
				toolCallChunk('launch_run', { projectDir: '/p', mode: 'coding' }),
				finalChunk('Launched the run.'),
			]),
			toolContext: stubContext({
				launchRun: async () => {
					launched += 1;
					return { id: 'run_1', mode: 'coding', projectName: 'demo' };
				},
			}),
		});

		const result = await agent.runTurn({
			allowFileEdits: false,
			fleetSummary,
			messages: [userMessage('launch a coding run on demo')],
			profile,
			sessionId: 's1',
		});

		expect(launched).toBe(1);
		expect(result.text).toBe('Launched the run.');
		expect(result.actions).toHaveLength(1);
		expect(result.actions[0]).toMatchObject({
			kind: 'launch_run',
			status: 'ok',
			runId: 'run_1',
			projectName: 'demo',
		});
	});

	test('records a tool failure as an error action and keeps going', async () => {
		const agent = new DirectorChatAgent({
			resolveClient: clientConfigWith([
				toolCallChunk('launch_run', { projectDir: '/p' }),
				finalChunk('That run could not start.'),
			]),
			toolContext: stubContext({
				launchRun: async () => {
					throw new Error('Maximum concurrent runs reached');
				},
			}),
		});

		const result = await agent.runTurn({
			allowFileEdits: false,
			fleetSummary,
			messages: [userMessage('launch a run')],
			profile,
			sessionId: 's1',
		});

		expect(result.text).toBe('That run could not start.');
		expect(result.actions[0]?.status).toBe('error');
		expect(result.actions[0]?.error).toContain('Maximum concurrent runs reached');
	});

	test('stops at maxTurns with a graceful message and the partial trail', async () => {
		const agent = new DirectorChatAgent({
			maxTurns: 2,
			resolveClient: clientConfigWith([toolCallChunk('list_projects', {})]),
			toolContext: stubContext(),
		});

		const result = await agent.runTurn({
			allowFileEdits: false,
			fleetSummary,
			messages: [userMessage('keep going')],
			profile,
			sessionId: 's1',
		});

		expect(result.text).toContain('maximum number of tool steps');
		expect(result.actions).toHaveLength(2);
	});

	test('throws NoToolCallingProviderError when no provider resolves', async () => {
		const agent = new DirectorChatAgent({
			resolveClient: () => null,
			toolContext: stubContext(),
		});

		await expect(
			agent.runTurn({
				allowFileEdits: false,
				fleetSummary,
				messages: [userMessage('hi')],
				profile,
				sessionId: 's1',
			}),
		).rejects.toBeInstanceOf(NoToolCallingProviderError);
	});
});

import { describe, expect, test } from 'bun:test';
import {
	buildToolDefinitions,
	dispatchChatTool,
	type ChatAgentToolContext,
} from '../../backend/src/services/director/chatAgentTools.ts';

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

const dispatch = { allowFileEdits: false, sessionId: 's1' };

describe('chat agent tool definitions', () => {
	test('omits file tools unless file edits are enabled', () => {
		const names = (allow: boolean) =>
			buildToolDefinitions(allow).map((tool) => tool.function.name);
		expect(names(false)).not.toContain('write_file');
		expect(names(false)).toContain('get_recipe');
		expect(names(false)).toContain('launch_run');
		expect(names(true)).toContain('write_file');
		expect(names(true)).toContain('launch_run');
	});

	test('get_recipe returns the exact catalog definition', async () => {
		const { action, resultText } = await dispatchChatTool(
			'get_recipe',
			JSON.stringify({ recipeId: 'check-artifacts' }),
			stubContext({
				getRecipe: async () => ({
					description: 'Checks status only.',
					id: 'check-artifacts',
					steps: [{ stepType: 'aidd-cli' }],
				}),
			}),
			dispatch
		);
		expect(action).toMatchObject({ kind: 'query', status: 'ok', tool: 'get_recipe' });
		expect(resultText).toContain('Checks status only.');
	});
});

describe('chat agent tool dispatch', () => {
	test('run_cycle injects the current session id and starts in the background', async () => {
		let seenSession: string | undefined;
		const ctx = stubContext({
			startCycle: async (input) => {
				seenSession = input.sessionId;
				return { cycleId: 'cycle_9' };
			},
		});
		const { action, resultText } = await dispatchChatTool('run_cycle', '{}', ctx, dispatch);
		expect(seenSession).toBe('s1');
		expect(action).toMatchObject({ kind: 'run_cycle', status: 'ok', cycleId: 'cycle_9' });
		expect(resultText).toContain('cycle_9');
	});

	test('launch_suggestion maps a launched pipeline session id', async () => {
		const { action } = await dispatchChatTool(
			'launch_suggestion',
			JSON.stringify({ suggestionId: 'sug_recipe' }),
			stubContext({
				launchSuggestion: async (id) => ({ id, pipelineSessionId: 'pipe_1' }),
			}),
			dispatch
		);
		expect(action).toMatchObject({
			kind: 'launch_suggestion',
			pipelineSessionId: 'pipe_1',
			status: 'ok',
			suggestionId: 'sug_recipe',
		});
	});

	test('launch_suggestion maps the launched run id', async () => {
		const { action } = await dispatchChatTool(
			'launch_suggestion',
			JSON.stringify({ suggestionId: 'sug_1' }),
			stubContext(),
			dispatch
		);
		expect(action).toMatchObject({
			kind: 'launch_suggestion',
			status: 'ok',
			suggestionId: 'sug_1',
			runId: 'run_2',
		});
	});

	test('returns an error result for invalid JSON arguments', async () => {
		const { action, resultText } = await dispatchChatTool(
			'get_run',
			'not json',
			stubContext(),
			dispatch
		);
		expect(action.status).toBe('error');
		expect(resultText).toContain('not valid JSON');
	});

	test('returns an error result when a required argument is missing', async () => {
		const { action, resultText } = await dispatchChatTool(
			'get_run',
			'{}',
			stubContext(),
			dispatch
		);
		expect(action.status).toBe('error');
		expect(resultText).toContain('Missing required string argument: runId');
	});

	test('rejects file tools when file editing is disabled', async () => {
		const { action, resultText } = await dispatchChatTool(
			'write_file',
			JSON.stringify({ projectId: 'demo', path: 'a.txt', content: 'x' }),
			stubContext(),
			dispatch
		);
		expect(action.status).toBe('error');
		expect(resultText).toContain('file editing is disabled');
	});

	test('reports an unknown tool as an error result', async () => {
		const { action, resultText } = await dispatchChatTool(
			'nope',
			'{}',
			stubContext(),
			dispatch
		);
		expect(action.status).toBe('error');
		expect(resultText).toContain('unknown tool');
	});
});

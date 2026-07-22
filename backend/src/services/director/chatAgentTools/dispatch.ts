import type { ChatAgentAction } from 'aidd-shared';

import { executeTool } from 'aidd-shared/agent/tools/index';

import type { ChatAgentToolContext, DispatchContext, DispatchResult } from './types.ts';

import {
	asArgs,
	buildLaunchInput,
	jsonResult,
	optionalString,
	requireString,
	truncate,
} from './argHelpers.ts';
import { fileToolNames, mutatingFileToolNames } from './definitions.ts';

/**
 * Run one tool call. Tool failures are returned as `ERROR: ...` result strings (not thrown) so the
 * model can read the failure and continue the turn; every call also yields a {@link ChatAgentAction}
 * for the persisted action trail.
 * @param name
 * @param rawArguments
 * @param ctx
 * @param dispatch
 * @returns The dispatch result containing the action and result text.
 */
export async function dispatchChatTool(
	name: string,
	rawArguments: string,
	ctx: ChatAgentToolContext,
	dispatch: DispatchContext
): Promise<DispatchResult> {
	let args: Record<string, unknown>;
	try {
		args = asArgs(JSON.parse(rawArguments));
	} catch {
		return errorResult('query', name, `ERROR: arguments were not valid JSON: ${rawArguments}`);
	}

	try {
		if (fileToolNames.has(name)) {
			return await dispatchFileTool(name, args, ctx, dispatch);
		}
		return await dispatchOrchestrateTool(name, args, ctx, dispatch);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return errorResult(kindForTool(name), name, `ERROR: ${message}`);
	}
}

async function dispatchOrchestrateTool(
	name: string,
	args: Record<string, unknown>,
	ctx: ChatAgentToolContext,
	dispatch: DispatchContext
): Promise<DispatchResult> {
	switch (name) {
		case 'dismiss_suggestion': {
			const suggestionId = requireString(args, 'suggestionId');
			await ctx.dismissSuggestion(suggestionId);
			return {
				action: {
					kind: 'dismiss_suggestion',
					status: 'ok',
					suggestionId,
					summary: `Dismissed suggestion ${suggestionId}`,
					tool: name,
				},
				resultText: `Dismissed suggestion ${suggestionId}.`,
			};
		}
		case 'get_fleet_summary': {
			const result = await ctx.getFleetSummary();
			return ok('query', name, 'Read fleet summary', jsonResult(result));
		}
		case 'get_project': {
			const projectId = requireString(args, 'projectId');
			const result = await ctx.getProjectDetail(projectId);
			return ok('query', name, `Inspected project ${projectId}`, jsonResult(result));
		}
		case 'get_recipe': {
			const recipeId = requireString(args, 'recipeId');
			const result = await ctx.getRecipe(recipeId);
			return ok('query', name, `Inspected recipe ${recipeId}`, jsonResult(result));
		}
		case 'get_run': {
			const runId = requireString(args, 'runId');
			const result = await ctx.getRun(runId);
			return {
				action: {
					kind: 'query',
					runId,
					status: 'ok',
					summary: `Read run ${runId}`,
					tool: name,
				},
				resultText: jsonResult(result),
			};
		}
		case 'kill_run': {
			const runId = requireString(args, 'runId');
			await ctx.killRun(runId);
			return {
				action: {
					kind: 'kill_run',
					runId,
					status: 'ok',
					summary: `Killed run ${runId}`,
					tool: name,
				},
				resultText: `Killed run ${runId}.`,
			};
		}
		case 'launch_run': {
			const run = await ctx.launchRun(buildLaunchInput(args));
			return {
				action: {
					kind: 'launch_run',
					mode: run.mode,
					projectName: run.projectName,
					runId: run.id,
					status: 'ok',
					summary: `Launched ${run.mode} run on ${run.projectName}`,
					tool: name,
				},
				resultText: jsonResult(run),
			};
		}
		case 'launch_suggestion': {
			const suggestionId = requireString(args, 'suggestionId');
			const launched = await ctx.launchSuggestion(suggestionId);
			return {
				action: {
					kind: 'launch_suggestion',
					status: 'ok',
					suggestionId,
					summary: `Launched suggestion ${suggestionId}`,
					tool: name,
					...('pipelineSessionId' in launched
						? { pipelineSessionId: launched.pipelineSessionId }
						: { runId: launched.runId }),
				},
				resultText: jsonResult(launched),
			};
		}
		case 'list_projects': {
			const result = await ctx.listProjects();
			return ok('query', name, 'Listed projects', jsonResult(result));
		}
		case 'list_suggestions': {
			const result = await ctx.listSuggestions();
			return ok('query', name, 'Listed suggestions', jsonResult(result));
		}
		case 'run_cycle': {
			const directive = optionalString(args, 'directive');
			const started = await ctx.startCycle({
				sessionId: dispatch.sessionId,
				...(directive !== undefined ? { directive } : {}),
			});
			return {
				action: {
					cycleId: started.cycleId,
					kind: 'run_cycle',
					status: 'ok',
					summary: 'Started Director cycle',
					tool: name,
				},
				resultText: jsonResult({ cycleId: started.cycleId, status: 'started' }),
			};
		}
		case 'run_output': {
			const runId = requireString(args, 'runId');
			const result = await ctx.readRunOutput(runId);
			return {
				action: {
					kind: 'query',
					runId,
					status: 'ok',
					summary: `Read output for run ${runId}`,
					tool: name,
				},
				resultText: jsonResult(result),
			};
		}
		case 'stop_run': {
			const runId = requireString(args, 'runId');
			await ctx.stopRun(runId);
			return {
				action: {
					kind: 'stop_run',
					runId,
					status: 'ok',
					summary: `Stopped run ${runId}`,
					tool: name,
				},
				resultText: `Stopped run ${runId}.`,
			};
		}
		default:
			return errorResult('query', name, `ERROR: unknown tool: ${name}`);
	}
}

async function dispatchFileTool(
	name: string,
	args: Record<string, unknown>,
	ctx: ChatAgentToolContext,
	dispatch: DispatchContext
): Promise<DispatchResult> {
	if (!dispatch.allowFileEdits) {
		return errorResult(
			'file_edit',
			name,
			'ERROR: direct file editing is disabled for Director chat.'
		);
	}
	const projectId = requireString(args, 'projectId');
	const cwd = await ctx.resolveProjectPath(projectId);
	const { projectId: _omit, ...toolArgs } = args;
	const resultText = truncate(await executeTool(name, JSON.stringify(toolArgs), cwd, false));
	const kind = mutatingFileToolNames.has(name) ? 'file_edit' : 'query';
	const path = optionalString(args, 'path');
	return {
		action: {
			kind,
			projectName: projectId,
			status: resultText.startsWith('ERROR:') ? 'error' : 'ok',
			summary: `${name} in ${projectId}`,
			tool: name,
			...(path !== undefined ? { path } : {}),
			...(resultText.startsWith('ERROR:') ? { error: resultText } : {}),
		},
		resultText,
	};
}

function kindForTool(name: string): ChatAgentAction['kind'] {
	switch (name) {
		case 'dismiss_suggestion':
			return 'dismiss_suggestion';
		case 'kill_run':
			return 'kill_run';
		case 'launch_run':
			return 'launch_run';
		case 'launch_suggestion':
			return 'launch_suggestion';
		case 'run_cycle':
			return 'run_cycle';
		case 'stop_run':
			return 'stop_run';
		default:
			return fileToolNames.has(name) && mutatingFileToolNames.has(name)
				? 'file_edit'
				: 'query';
	}
}

function ok(
	kind: ChatAgentAction['kind'],
	tool: string,
	summary: string,
	resultText: string
): DispatchResult {
	return { action: { kind, status: 'ok', summary, tool }, resultText };
}

function errorResult(
	kind: ChatAgentAction['kind'],
	tool: string,
	resultText: string
): DispatchResult {
	return {
		action: { error: resultText, kind, status: 'error', summary: resultText, tool },
		resultText,
	};
}

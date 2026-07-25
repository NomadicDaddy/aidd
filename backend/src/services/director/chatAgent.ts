import type { ChatAgentAction, DirectorChatMessageRecord } from 'aidd-shared';
import type { AiCallSurface } from 'aidd-shared/lib/aiCallLog';

import {
	type AgentLoopResponse,
	type AgentMessage,
	OpenAICompatibleAgentClient,
	type OpenAICompatibleClientConfig,
} from 'aidd-shared/agent/client';

import type { DirectorRecipeSummary, FleetSummary, ProfileRow } from './types.ts';

import {
	buildToolDefinitions,
	type ChatAgentToolContext,
	dispatchChatTool,
} from './chatAgentTools.ts';
import { maxChatMessageLength, normalizeReasoningEffort } from './helpers.ts';

const defaultMaxTurns = 12;
const defaultPerCallTimeoutMs = 120_000;
/**
 * Maximum number of launch_run / launch_suggestion / run_cycle tool calls allowed
 * per Director chat turn. Without this budget a single turn could fan out the full
 * tool-call quota of launches, overwhelming the run ceiling or the fleet.
 */
const maxLaunchesPerTurn = 3;
const launchTools: ReadonlySet<string> = new Set(['launch_run', 'launch_suggestion', 'run_cycle']);

/**
 * Thrown when no OpenAI-compatible (tool-calling) provider can be resolved for the chat surface.
 * The chat service catches this and falls back to the non-agentic, text-only path.
 */
export class NoToolCallingProviderError extends Error {
	constructor() {
		super('No tool-calling provider available for agentic Director chat.');
		this.name = 'NoToolCallingProviderError';
	}
}

export interface ChatAgentTurnInput {
	allowFileEdits: boolean;
	fleetSummary: FleetSummary;
	messages: DirectorChatMessageRecord[];
	profile: ProfileRow;
	recipeCatalog?: DirectorRecipeSummary[];
	sessionId: string;
}

export interface ChatAgentTurnResult {
	actions: ChatAgentAction[];
	text: string;
}

export interface DirectorChatAgentOptions {
	maxTurns?: number;
	perCallTimeoutMs?: number;
	resolveClient: (model?: string) => null | OpenAICompatibleClientConfig;
	toolContext: ChatAgentToolContext;
}

/**
 * Runs a Director chat turn as an autonomous tool-calling loop over an OpenAI-compatible
 * provider. The agent reasons, calls orchestration tools (and, when opted in, project file tools),
 * observes the results, and replies. Mutations flow through supervised runs by default; the loop
 * itself only edits files when `allowFileEdits` is on.
 */
export class DirectorChatAgent {
	private readonly resolveClient: (model?: string) => null | OpenAICompatibleClientConfig;
	private readonly toolContext: ChatAgentToolContext;
	private readonly maxTurns: number;
	private readonly perCallTimeoutMs: number;

	constructor(options: DirectorChatAgentOptions) {
		this.resolveClient = options.resolveClient;
		this.toolContext = options.toolContext;
		this.maxTurns = options.maxTurns ?? defaultMaxTurns;
		this.perCallTimeoutMs = options.perCallTimeoutMs ?? defaultPerCallTimeoutMs;
	}

	async runTurn(input: ChatAgentTurnInput): Promise<ChatAgentTurnResult> {
		const clientConfig = this.resolveClient(input.profile.model ?? undefined);
		if (clientConfig === null) throw new NoToolCallingProviderError();
		const client = new OpenAICompatibleAgentClient({
			...clientConfig,
			callSource: 'direct',
			callSurface: 'director_chat' as AiCallSurface,
		});
		const tools = buildToolDefinitions(input.allowFileEdits);
		const reasoningEffort = normalizeReasoningEffort(input.profile.reasoningEffort);
		const messages: AgentMessage[] = [{ content: buildAgenticPreamble(input), role: 'user' }];
		const actions: ChatAgentAction[] = [];
		let launchesRemaining = maxLaunchesPerTurn;

		for (let turn = 0; turn < this.maxTurns; turn++) {
			let response;
			try {
				response = await this.complete(
					client,
					messages,
					tools,
					input.profile,
					reasoningEffort,
					turn,
				);
			} catch (err) {
				// A provider/abort err after at least one action would otherwise lose the trail of
				// real side effects (e.g. a launched run). Surface what happened instead of throwing.
				if (actions.length === 0) throw err;
				const message = err instanceof Error ? err.message : String(err);
				return {
					actions,
					text: `I ran into a problem completing this turn (${message}), but I already performed the actions listed below.`,
				};
			}

			if (!response.toolCalls?.length) {
				const text = response.text.trim();
				if (!text && actions.length === 0) {
					throw new Error('Director chat produced no assistant response.');
				}
				return {
					actions,
					text: (text || 'Done.').slice(0, maxChatMessageLength),
				};
			}

			messages.push({
				content: response.text || null,
				role: 'assistant',
				toolCalls: response.toolCalls,
			});
			for (const call of response.toolCalls) {
				// Enforce a per-turn budget on launch-capable tools so a single turn
				// cannot fan out the full tool-call quota of runs. Budget-exhausted
				// launch calls are converted to error results and the turn continues;
				// the model sees the rejection and can finish with a text reply.
				if (launchTools.has(call.name) && launchesRemaining <= 0) {
					const budgetError =
						'Per-turn launch budget exceeded. Finish your reply and the user can request more launches in a new message.';
					actions.push({
						error: budgetError,
						kind: launchKindForTool(call.name),
						status: 'error',
						summary: 'Launch budget exceeded for this turn.',
						tool: call.name,
					});
					messages.push({
						content: `ERROR: ${budgetError}`,
						role: 'tool',
						toolCallId: call.id,
					});
					continue;
				}
				if (launchTools.has(call.name)) launchesRemaining -= 1;
				const { action, resultText } = await dispatchChatTool(
					call.name,
					call.arguments,
					this.toolContext,
					{ allowFileEdits: input.allowFileEdits, sessionId: input.sessionId },
				);
				actions.push(action);
				messages.push({ content: resultText, role: 'tool', toolCallId: call.id });
			}
		}

		return {
			actions,
			text: 'I reached the maximum number of tool steps for this turn. The actions I completed are listed below — ask me to continue if more is needed.',
		};
	}

	private async complete(
		client: OpenAICompatibleAgentClient,
		messages: AgentMessage[],
		tools: ReturnType<typeof buildToolDefinitions>,
		profile: ProfileRow,
		reasoningEffort: string,
		turn: number,
	): Promise<AgentLoopResponse> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.perCallTimeoutMs);
		try {
			return await client.complete(
				{
					cwd: process.cwd(),
					messages,
					prompt: '',
					reasoningEffort,
					tools,
					turn,
					...(profile.model ? { model: profile.model } : {}),
				},
				controller.signal,
			);
		} finally {
			clearTimeout(timeout);
		}
	}
}

function launchKindForTool(name: string): 'launch_run' | 'launch_suggestion' | 'run_cycle' {
	switch (name) {
		case 'launch_suggestion':
			return 'launch_suggestion';
		case 'run_cycle':
			return 'run_cycle';
		default:
			return 'launch_run';
	}
}

export function buildAgenticPreamble(input: ChatAgentTurnInput): string {
	const { allowFileEdits, fleetSummary, messages, profile } = input;
	const recipeCatalog = input.recipeCatalog ?? [];
	const transcript = messages
		.map((message) => `${message.role.toUpperCase()}: ${message.content}`)
		.join('\n\n');
	const policy = allowFileEdits
		? 'Direct file editing is ENABLED for this session. Prefer launching runs for substantial work; use the file tools only for small, surgical edits the user explicitly asked for, and always pass the target projectId.'
		: 'You never edit project files yourself. All code changes go through supervised runs you launch (launch_run / launch_suggestion / run_cycle), which appear on the Runs page where the user can stop or kill them.';
	return [
		'You are the aidd Director operating agentically in live chat.',
		'You have tools to inspect the fleet and to orchestrate work. Reason about the request, call the tools you need, observe their results, then reply describing what you did and why.',
		'Never infer recipe behavior from its name. Use the recipe catalog descriptions and call get_recipe for the exact steps before explaining or launching recipe-backed work.',
		policy,
		'Prefer the smallest set of actions that satisfies the request. If a tool returns an error, read it and adapt instead of repeating the same call. When you only need to answer a question, just answer without launching anything.',
		'',
		'## Active Director Profile',
		`Role: ${profile.role}`,
		`Backend: ${profile.backend}`,
		`Model: ${profile.model ?? 'default'}`,
		`Reasoning effort: ${profile.reasoningEffort}`,
		`Behavior instructions: ${profile.instructions || 'No extra instructions.'}`,
		'',
		'## Current Fleet Summary',
		JSON.stringify(fleetSummary, null, 2),
		'',
		'## Recipe Catalog',
		JSON.stringify(recipeCatalog, null, 2),
		'',
		'## Conversation So Far',
		transcript || 'No prior messages.',
	].join('\n');
}

import type { DirectorChatMessageRecord } from 'aidd-shared';
import type { AgentEvent } from 'aidd-shared/backends/types';

import { monitorBackend } from 'aidd-shared/backends/monitor';
import { exitCodeFromEvents } from 'aidd-shared/orchestrator/result';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { DirectAiRunner } from '../directAiService.ts';
import type {
	BackendFactory,
	DirectorConfigProvider,
	DirectorRecipeSummary,
	FleetSummary,
	ProfileRow,
} from './types.ts';

import {
	buildChatPrompt,
	maxChatMessageLength,
	normalizeBackend,
	normalizeReasoningEffort,
} from './helpers.ts';

export interface ChatTextTurnDeps {
	backendFactory: BackendFactory;
	directAiService: DirectAiRunner;
	getConfig: DirectorConfigProvider;
}

/**
 * Text-only director chat turn: used when tool-calling is unavailable. Produces an
 * assistant reply without any actions, rejecting any attempt to modify files.
 * @param deps
 * @param profile
 * @param fleetSummary
 * @param messages
 * @param recipeCatalog
 * @returns The assistant's text reply.
 */
export async function runTextOnlyChatTurn(
	deps: ChatTextTurnDeps,
	profile: ProfileRow,
	fleetSummary: FleetSummary,
	messages: DirectorChatMessageRecord[],
	recipeCatalog: DirectorRecipeSummary[] = [],
): Promise<string> {
	const config = deps.getConfig();
	const cwd = join(config.web.dataDir, 'director', 'chat-work');
	await mkdir(cwd, { recursive: true });
	const prompt = buildChatPrompt(profile, fleetSummary, messages, recipeCatalog);
	if (deps.directAiService.isSurfaceEnabled('directorChat')) {
		const directReply = await deps.directAiService.completeText({
			cwd,
			...(profile.model ? { model: profile.model } : {}),
			prompt,
			reasoningEffort: normalizeReasoningEffort(profile.reasoningEffort),
			surface: 'directorChat',
		});
		// completeText only returns null when the surface is disabled. We just
		// checked it was enabled, so a null here means it was toggled off between
		// the check and the call. Treat that race as a no-op for the user.
		if (directReply === null)
			throw new Error('Direct AI was disabled while the director chat turn was in flight.');
		if (directReply.trim().length === 0) {
			throw new Error('Director chat produced no assistant response.');
		}
		return directReply.slice(0, maxChatMessageLength);
	}
	const backend = deps.backendFactory(normalizeBackend(profile.backend));
	const events: AgentEvent[] = [];
	const controller = new AbortController();
	const promptInput = {
		cwd,
		heuristicMode: 'planning' as const,
		reasoningEffort: profile.reasoningEffort,
		text: prompt,
		...(profile.model ? { model: profile.model } : {}),
	};
	for await (const event of monitorBackend(backend, promptInput, controller.signal, {
		idleNudgeTimeoutMs: config.idleNudgeTimeoutSeconds * 1000,
		idleTimeoutMs: config.idleTimeoutSeconds * 1000,
	})) {
		events.push(event);
	}
	const modifiedFiles = events.flatMap((event) =>
		event.type === 'done' ? event.filesModified : [],
	);
	if (modifiedFiles.length > 0) {
		throw new Error('Director chat attempted to modify files; response rejected.');
	}
	const exitCode = exitCodeFromEvents(events);
	if (exitCode !== 0) throw new Error(`Director chat failed with exit code ${exitCode}.`);
	const reply = events
		.filter((event): event is Extract<AgentEvent, { type: 'assistant_text' }> => {
			return event.type === 'assistant_text';
		})
		.map((event) => event.chunk)
		.join('\n')
		.trim();
	if (!reply) throw new Error('Director chat produced no assistant response.');
	return reply.slice(0, maxChatMessageLength);
}

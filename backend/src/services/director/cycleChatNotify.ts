import type { DirectorOutput } from 'aidd-shared';

import { type DirectorChatService } from './chatService.ts';

/**
 * System messages posted into the chat session that asked for a cycle.
 *
 * A cycle started from chat has an operator waiting in a conversation, and the cycle's own
 * persistence path has no business knowing that. Both functions no-op without a session id: a
 * cycle started from the Director page or the scheduler simply has nobody to tell.
 */

/**
 * Reports a finished cycle back into the session that requested it.
 *
 * @param chatService Chat store the message is written through.
 * @param cycleId Cycle the message is about.
 * @param sessionId Session that asked for the cycle, or undefined when none did.
 * @param output Parsed cycle output, absent when the cycle produced none.
 * @returns Resolves once the message is written and the session touched.
 */
export async function notifyChatSession(
	chatService: DirectorChatService,
	cycleId: string,
	sessionId: string | undefined,
	output: DirectorOutput | undefined,
): Promise<void> {
	if (!sessionId) return;
	const suggestionCount = output?.suggestions.length ?? 0;
	await chatService.insertChatMessage({
		content: `Director cycle \`${cycleId}\` completed with ${suggestionCount} ${suggestionCount === 1 ? 'suggestion' : 'suggestions'}.`,
		createdAt: Date.now(),
		cycleId,
		role: 'system',
		sessionId,
	});
	await chatService.touchChatSession(sessionId);
}

/**
 * Reports a failed cycle back into the session that requested it.
 *
 * @param chatService Chat store the message is written through.
 * @param cycleId Cycle the message is about.
 * @param sessionId Session that asked for the cycle, or undefined when none did.
 * @param error Whatever the cycle threw; non-Errors are stringified.
 * @returns Resolves once the message is written and the session touched.
 */
export async function notifyChatSessionFailure(
	chatService: DirectorChatService,
	cycleId: string,
	sessionId: string | undefined,
	error: unknown,
): Promise<void> {
	if (!sessionId) return;
	const message = error instanceof Error ? error.message : String(error);
	await chatService.insertChatMessage({
		content: `Director cycle ${cycleId} failed: ${message}`,
		createdAt: Date.now(),
		cycleId,
		role: 'system',
		sessionId,
	});
	await chatService.touchChatSession(sessionId);
}

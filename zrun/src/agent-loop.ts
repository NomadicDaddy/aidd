import type { ChatMessage, SessionUsage } from './types';
import { streamChatCompletion } from './client';
import { executeTool } from './tools/index';

const MAX_CONTINUATION_NUDGES = 3;

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

function logUsage(session: SessionUsage): void {
	process.stdout.write(
		`[usage] turn: prompt=${formatTokens(session.lastPromptTokens)} ` +
			`completion=${formatTokens(session.lastCompletionTokens)} ` +
			`cached=${formatTokens(session.lastCachedTokens)} | ` +
			`session: total=${formatTokens(session.totalTokens)} ` +
			`(prompt=${formatTokens(session.totalPromptTokens)} ` +
			`completion=${formatTokens(session.totalCompletionTokens)} ` +
			`cached=${formatTokens(session.totalCachedTokens)})\n`
	);
}

/**
 * Check if the model's text-only response looks like it stopped prematurely.
 * If the response contains phrases suggesting there's more work to do but the
 * model stopped calling tools, we nudge it to continue.
 */
function looksIncomplete(content: string): boolean {
	const lower = content.toLowerCase();
	const incompleteSignals = [
		'let me continue',
		'let me now',
		'next, i',
		'i will now',
		'i need to',
		'moving on to',
		'now let me',
		'let me create',
		'let me also',
		'i should also',
		'remaining',
		'still need to',
		'the following steps',
		'continue with',
		'let me proceed',
		'let me check',
		'let me examine',
		'let me look',
		'let me scan',
		'let me review',
	];
	return incompleteSignals.some((signal) => lower.includes(signal));
}

export interface SessionStats {
	turns: number;
	totalPromptTokens: number;
	totalCompletionTokens: number;
	totalTokens: number;
	totalCachedTokens: number;
}

export async function runAgentLoop(
	messages: ChatMessage[],
	cwd: string,
	maxTurns: number
): Promise<SessionStats> {
	const session: SessionUsage = {
		turns: 0,
		totalPromptTokens: 0,
		totalCompletionTokens: 0,
		totalTokens: 0,
		totalCachedTokens: 0,
		lastPromptTokens: 0,
		lastCompletionTokens: 0,
		lastCachedTokens: 0,
	};

	let continuationNudges = 0;

	for (let turn = 0; turn < maxTurns; turn++) {
		process.stdout.write(`\n--- [zrun turn ${turn + 1}/${maxTurns}] ---\n`);

		let result;
		try {
			result = await streamChatCompletion(messages);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);

			// Emit patterns that AIDD's monitor_coprocess_output recognizes
			if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate limit')) {
				process.stdout.write(`hit your limit - rate limited by API\n`);
			} else if (
				errMsg.includes('401') ||
				errMsg.includes('403') ||
				errMsg.toLowerCase().includes('unauthorized') ||
				errMsg.toLowerCase().includes('authentication')
			) {
				process.stdout.write(`Provider returned error: ${errMsg}\n`);
			} else {
				process.stdout.write(`ERROR: API call failed: ${errMsg}\n`);
			}

			logUsage(session);
			process.exit(1);
		}

		// Track token usage
		session.turns++;
		session.lastPromptTokens = result.usage.promptTokens;
		session.lastCompletionTokens = result.usage.completionTokens;
		session.lastCachedTokens = result.usage.cachedTokens;
		session.totalPromptTokens += result.usage.promptTokens;
		session.totalCompletionTokens += result.usage.completionTokens;
		session.totalTokens += result.usage.totalTokens;
		session.totalCachedTokens += result.usage.cachedTokens;

		logUsage(session);

		// Add assistant message to conversation
		if (result.toolCalls.length > 0) {
			messages.push({
				role: 'assistant',
				content: result.content || null,
				tool_calls: result.toolCalls,
			});
			// Reset continuation counter when model uses tools
			continuationNudges = 0;
		} else {
			messages.push({
				role: 'assistant',
				content: result.content || null,
			});
		}

		// No tool calls — check if the model stopped prematurely
		if (result.toolCalls.length === 0) {
			const content = result.content ?? '';

			if (looksIncomplete(content) && continuationNudges < MAX_CONTINUATION_NUDGES) {
				continuationNudges++;
				process.stdout.write(
					`\n[zrun] Model stopped but response looks incomplete ` +
						`(nudge ${continuationNudges}/${MAX_CONTINUATION_NUDGES}). ` +
						`Sending continuation prompt...\n`
				);
				messages.push({
					role: 'user',
					content:
						'You stopped before completing the task. ' +
						'Continue where you left off. Use your tools (read_file, write_file, edit_file, glob, grep, bash) to complete the remaining work. ' +
						'Do NOT summarize what you plan to do — just do it by calling the appropriate tools.',
				});
				continue;
			}

			process.stdout.write(`\n[zrun] Agent completed (no more tool calls)\n`);
			return session;
		}

		// Execute each tool call sequentially
		for (const tc of result.toolCalls) {
			process.stdout.write(`\n[tool] ${tc.function.name}: `);

			// Log a summary of args (truncated)
			const argsSummary =
				tc.function.arguments.length > 200
					? tc.function.arguments.substring(0, 200) + '...'
					: tc.function.arguments;
			process.stdout.write(`${argsSummary}\n`);

			const toolResult = await executeTool(tc.function.name, tc.function.arguments, cwd);

			// Log tool result (truncated for readability)
			const resultSummary =
				toolResult.length > 500
					? toolResult.substring(0, 500) + `\n... (${toolResult.length} chars total)`
					: toolResult;
			process.stdout.write(`[result] ${resultSummary}\n`);

			messages.push({
				role: 'tool',
				tool_call_id: tc.id,
				content: toolResult,
			});
		}
	}

	process.stdout.write(`\n[zrun] Max turns (${maxTurns}) reached. Exiting.\n`);
	return session;
}

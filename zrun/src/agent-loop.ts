import type { ChatMessage, SessionUsage } from './types';
import { streamChatCompletion } from './client';
import { c } from './colors';
import { executeTool } from './tools/index';

const MAX_CONTINUATION_NUDGES = 3;
const MAX_HALLUCINATION_NUDGES = 2;

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

function cachePercent(cached: number, prompt: number): string {
	if (prompt === 0) return '0%';
	return `${Math.round((cached / prompt) * 100)}%`;
}

function logUsage(session: SessionUsage): void {
	const turnCacheHit = cachePercent(session.lastCachedTokens, session.lastPromptTokens);
	const sessionCacheHit = cachePercent(session.totalCachedTokens, session.totalPromptTokens);

	process.stdout.write(
		`${c.usagePrefix} ` +
			`turn: prompt=${c.info(formatTokens(session.lastPromptTokens))} ` +
			`completion=${c.info(formatTokens(session.lastCompletionTokens))} ` +
			`cached=${c.info(formatTokens(session.lastCachedTokens))} (${c.value(turnCacheHit)}) ${c.dim('|')} ` +
			`session: total=${c.info(formatTokens(session.totalTokens))} ` +
			`(prompt=${c.info(formatTokens(session.totalPromptTokens))} ` +
			`completion=${c.info(formatTokens(session.totalCompletionTokens))} ` +
			`cached=${c.info(formatTokens(session.totalCachedTokens))} (${c.value(sessionCacheHit)}))` +
			'\n'
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

/**
 * Detect when the model hallucinates file creation, git commits, or tool
 * results in plain text instead of actually calling tools.
 *
 * GLM-5 is prone to emitting text that *describes* creating files, shows
 * fake [result] / [commit ...] / [exit code: 0] output, or dumps JSON
 * content inline — all without making any tool calls.
 */
function detectsHallucinatedActions(content: string): string | null {
	const lower = content.toLowerCase();

	// Fabricated tool results (the model is pretending it ran tools)
	const fakeToolOutput = [
		'[result]',
		'[exit code:',
		'[commit ',
		'created 10 feature',
		'created feature',
		'creating feature directory',
		'feature.json file:',
		'committing audit',
		'updating changelog',
	];
	const fakeToolCount = fakeToolOutput.filter((s) => lower.includes(s)).length;
	if (fakeToolCount >= 2) {
		return 'hallucinated_tool_results';
	}

	// Fabricated file creation (mentions creating/writing files without tool calls)
	const fileCreationSignals = [
		'batch 1:',
		'batch 2:',
		'creating feature directory:',
		'created 10 ',
		'created audit report',
		'generated audit report',
	];
	if (fileCreationSignals.some((s) => lower.includes(s))) {
		return 'hallucinated_file_creation';
	}

	return null;
}

/**
 * Detect degenerate/repetitive output — a sign the model has lost coherence.
 * Checks for the same substantial text fragment appearing many times.
 */
function detectsDegeneration(content: string): boolean {
	// Check for repeated JSON-like fragments (e.g., same "auditSource" block 5+ times)
	const lines = content.split('\n').filter((l) => l.trim().length > 20);
	if (lines.length < 10) return false;

	const freq = new Map<string, number>();
	for (const line of lines) {
		const trimmed = line.trim();
		freq.set(trimmed, (freq.get(trimmed) ?? 0) + 1);
	}

	// If any non-trivial line repeats 5+ times, it's degenerate
	for (const [line, count] of freq) {
		if (count >= 5 && line.length > 30) {
			return true;
		}
	}

	// Also check for very long text-only responses (>3000 chars with no tool calls is suspicious)
	// The model should be calling tools, not writing essays
	if (content.length > 3000) {
		// Count how many lines look like JSON fragments
		const jsonLines = lines.filter(
			(l) => l.trim().startsWith('"') || l.trim().startsWith('{') || l.trim().startsWith('}')
		);
		if (jsonLines.length > 20) {
			return true;
		}
	}

	return false;
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
	let hallucinationNudges = 0;

	for (let turn = 0; turn < maxTurns; turn++) {
		process.stdout.write(`\n${c.turn(`--- [zrun turn ${turn + 1}/${maxTurns}] ---`)}\n`);

		// Thinking timer — show waiting message, then elapsed when first content arrives
		const thinkStart = Date.now();
		process.stdout.write(c.dim('Thinking...') + '\n');
		let thinkingStopped = false;

		const stopThinking = () => {
			if (!thinkingStopped) {
				thinkingStopped = true;
				const elapsed = ((Date.now() - thinkStart) / 1000).toFixed(1);
				process.stdout.write(c.dim(`Thought ${elapsed}s.`) + '\n');
			}
		};

		let result;
		try {
			result = await streamChatCompletion(messages, stopThinking);
		} catch (err) {
			stopThinking();
			const errMsg = err instanceof Error ? err.message : String(err);

			// Emit patterns that AIDD's monitor_coprocess_output recognizes
			if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate limit')) {
				process.stdout.write(c.error(`hit your limit - rate limited by API`) + '\n');
			} else if (
				errMsg.includes('401') ||
				errMsg.includes('403') ||
				errMsg.toLowerCase().includes('unauthorized') ||
				errMsg.toLowerCase().includes('authentication')
			) {
				process.stdout.write(c.error(`Provider returned error: ${errMsg}`) + '\n');
			} else {
				process.stdout.write(c.error(`ERROR: API call failed: ${errMsg}`) + '\n');
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
			// Reset counters when model uses tools
			continuationNudges = 0;
			hallucinationNudges = 0;
		} else {
			messages.push({
				role: 'assistant',
				content: result.content || null,
			});
		}

		// No tool calls — check if the model stopped prematurely or hallucinated
		if (result.toolCalls.length === 0) {
			const content = result.content ?? '';

			// Priority 1: Detect degenerate/repetitive output — abort immediately
			if (detectsDegeneration(content)) {
				process.stdout.write(
					'\n' +
						c.error(
							`[zrun] ABORT: Model output is degenerate (repetitive/incoherent text). ` +
								`Terminating to avoid wasting tokens.`
						) +
						'\n'
				);
				return session;
			}

			// Priority 2: Detect hallucinated actions (fake file creation, fake tool results)
			const hallucinationType = detectsHallucinatedActions(content);
			if (hallucinationType && hallucinationNudges < MAX_HALLUCINATION_NUDGES) {
				hallucinationNudges++;
				process.stdout.write(
					'\n' +
						c.warn(
							`[zrun] WARNING: Model hallucinated actions without tool calls ` +
								`(${hallucinationType}, nudge ${hallucinationNudges}/${MAX_HALLUCINATION_NUDGES}). ` +
								`Sending correction...`
						) +
						'\n'
				);
				messages.push({
					role: 'user',
					content:
						'CRITICAL ERROR: You just described creating files, committing changes, or showed tool results — ' +
						'but you did NOT actually call any tools. None of those actions happened. ' +
						'No files were created, no commits were made, nothing was written to disk. ' +
						'You MUST use the write_file tool to create files, and the bash tool to run git commands. ' +
						'Text descriptions of actions do NOT execute them. ' +
						'Start over: call write_file for each file you need to create. One tool call per file.',
				});
				continue;
			} else if (hallucinationType && hallucinationNudges >= MAX_HALLUCINATION_NUDGES) {
				process.stdout.write(
					'\n' +
						c.error(
							`[zrun] ABORT: Model continues to hallucinate actions after ` +
								`${MAX_HALLUCINATION_NUDGES} corrections. Terminating.`
						) +
						'\n'
				);
				return session;
			}

			// Priority 3: Looks incomplete (model wants to continue but stopped calling tools)
			if (looksIncomplete(content) && continuationNudges < MAX_CONTINUATION_NUDGES) {
				continuationNudges++;
				process.stdout.write(
					'\n' +
						c.nudge(
							`[zrun] Model stopped but response looks incomplete ` +
								`(nudge ${continuationNudges}/${MAX_CONTINUATION_NUDGES}). ` +
								`Sending continuation prompt...`
						) +
						'\n'
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

			process.stdout.write('\n' + c.success(`[zrun] Agent completed (no more tool calls)`) + '\n');
			return session;
		}

		// Execute each tool call sequentially
		for (const tc of result.toolCalls) {
			process.stdout.write(`\n${c.toolPrefix} ${c.tool(tc.function.name)}: `);

			// Log a summary of args (truncated)
			const argsSummary =
				tc.function.arguments.length > 200
					? tc.function.arguments.substring(0, 200) + '...'
					: tc.function.arguments;
			process.stdout.write(c.toolArgs(argsSummary) + '\n');

			const toolResult = await executeTool(tc.function.name, tc.function.arguments, cwd);

			// Log tool result (truncated for readability)
			if (toolResult.length > 500) {
				const truncated = toolResult.substring(0, 500);
				process.stdout.write(
					`${c.resultPrefix} ${truncated}\n${c.resultTrunc(`... (${toolResult.length} chars total)`)}\n`
				);
			} else {
				process.stdout.write(`${c.resultPrefix} ${toolResult}\n`);
			}

			messages.push({
				role: 'tool',
				tool_call_id: tc.id,
				content: toolResult,
			});
		}
	}

	process.stdout.write('\n' + c.warn(`[zrun] Max turns (${maxTurns}) reached. Exiting.`) + '\n');
	return session;
}

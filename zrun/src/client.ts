import OpenAI from 'openai';
import type { ZRunConfig, ChatMessage, TokenUsage } from './types';
import { toolDefinitions } from './tools/index';

let client: OpenAI;
let modelName: string;

export function initClient(config: ZRunConfig): void {
	client = new OpenAI({
		apiKey: config.apiKey,
		baseURL: config.baseUrl,
	});
	modelName = config.model;
}

export async function streamChatCompletion(messages: ChatMessage[]): Promise<{
	content: string;
	toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
	usage: TokenUsage;
}> {
	const stream = await client.chat.completions.create({
		model: modelName,
		messages,
		tools: toolDefinitions,
		tool_choice: 'auto',
		stream: true,
		stream_options: { include_usage: true },
	});

	let content = '';
	let lineBuffer = '';
	const toolCallAccumulator = new Map<number, { id: string; name: string; arguments: string }>();
	let usage: TokenUsage = {
		promptTokens: 0,
		completionTokens: 0,
		totalTokens: 0,
		cachedTokens: 0,
	};

	for await (const chunk of stream) {
		// Capture usage from the final chunk
		if (chunk.usage) {
			const u = chunk.usage;
			const details = u.prompt_tokens_details as { cached_tokens?: number } | undefined;
			usage = {
				promptTokens: u.prompt_tokens ?? 0,
				completionTokens: u.completion_tokens ?? 0,
				totalTokens: u.total_tokens ?? 0,
				cachedTokens: details?.cached_tokens ?? 0,
			};
		}

		const delta = chunk.choices[0]?.delta;
		if (!delta) continue;

		// Accumulate text content and flush line-by-line
		if (delta.content) {
			content += delta.content;
			lineBuffer += delta.content;

			// Flush complete lines to stdout for AIDD idle detection
			const lines = lineBuffer.split('\n');
			for (let i = 0; i < lines.length - 1; i++) {
				process.stdout.write(lines[i] + '\n');
			}
			lineBuffer = lines[lines.length - 1];
		}

		// Accumulate tool calls
		if (delta.tool_calls) {
			for (const tc of delta.tool_calls) {
				const existing = toolCallAccumulator.get(tc.index);
				if (existing) {
					if (tc.function?.arguments) {
						existing.arguments += tc.function.arguments;
					}
				} else {
					toolCallAccumulator.set(tc.index, {
						id: tc.id ?? `call_${tc.index}`,
						name: tc.function?.name ?? '',
						arguments: tc.function?.arguments ?? '',
					});
				}
			}
		}
	}

	// Flush remaining line buffer
	if (lineBuffer) {
		process.stdout.write(lineBuffer + '\n');
	}

	const toolCalls = Array.from(toolCallAccumulator.values()).map((tc) => ({
		id: tc.id,
		type: 'function' as const,
		function: {
			name: tc.name,
			arguments: tc.arguments,
		},
	}));

	return { content, toolCalls, usage };
}

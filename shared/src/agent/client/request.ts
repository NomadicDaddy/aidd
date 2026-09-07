import type { AgentLoopRequest, AgentMessage, OpenAICompatibleClientConfig } from './types.ts';

// Local servers (ollama/lmstudio) default to non-streaming to limit blast radius; remote
// providers (openai/xai/zhipu) stream so long reasoning turns keep the socket active. An
// explicit config.stream always wins.
export function shouldStream(config: OpenAICompatibleClientConfig): boolean {
	if (config.stream !== undefined) return config.stream;
	return config.provider !== 'ollama' && config.provider !== 'lmstudio';
}

export function buildChatCompletionBody(
	config: OpenAICompatibleClientConfig,
	request: AgentLoopRequest,
	stream: boolean,
): Record<string, unknown> {
	const model = request.model ?? config.model;
	const body: Record<string, unknown> = {
		messages: (request.messages ?? [{ content: request.prompt, role: 'user' }]).map(
			toOpenAIMessage,
		),
		model,
		stream,
	};
	// Ask the provider to emit a final usage-only chunk (OpenAI/Z.AI convention) so a streamed
	// turn still reports prompt/completion/reasoning tokens for costing.
	if (stream) body.stream_options = { include_usage: true };
	if (request.tools) {
		body.tools = request.tools;
		body.tool_choice = 'auto';
	}
	if (config.provider === 'ollama') {
		const think = ollamaThinkValue(model, request);
		if (think !== undefined) body.think = think;
		return body;
	}
	// LM Studio's OpenAI-compatible chat API does not document `reasoning_effort`; sending it
	// risks a 400 on stricter local servers. Omit it by default. Revisit if a reasoning-capable
	// local model needs it — it would likely use its own control rather than this field.
	if (config.provider === 'lmstudio') {
		return body;
	}
	if (request.reasoningEffort !== undefined && request.reasoningEffort !== 'none') {
		body.reasoning_effort = request.reasoningEffort;
	}
	return body;
}

// Explicit Ollama controls win; the common effort field only bridges gpt-oss benchmark rows.
function ollamaThinkValue(model: string, request: AgentLoopRequest): boolean | string | undefined {
	if (request.thinkingLevel !== undefined) return request.thinkingLevel;
	if (request.thinking !== undefined) return request.thinking;
	const isGptOss = model.toLowerCase().startsWith('gpt-oss:');
	if (isGptOss && isOllamaThinkingLevel(request.reasoningEffort)) {
		return request.reasoningEffort;
	}
	return undefined;
}

function isOllamaThinkingLevel(value: string | undefined): value is 'high' | 'low' | 'medium' {
	return value === 'low' || value === 'medium' || value === 'high';
}

function toOpenAIMessage(message: AgentMessage): Record<string, unknown> {
	if (message.role === 'assistant') {
		return {
			content: message.content,
			role: 'assistant',
			...(message.toolCalls
				? {
						tool_calls: message.toolCalls.map((toolCall) => ({
							function: {
								arguments: toolCall.arguments,
								name: toolCall.name,
							},
							id: toolCall.id,
							type: 'function',
						})),
					}
				: {}),
		};
	}
	if (message.role === 'tool') {
		return {
			content: message.content,
			role: 'tool',
			tool_call_id: message.toolCallId,
		};
	}
	return message;
}

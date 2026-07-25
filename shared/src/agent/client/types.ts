import type { AgentEvent } from '../../backends/types.ts';
import type { AiCallSurface } from '../../lib/aiCallLog.ts';

export const providerDefaults = {
	lmstudio: {
		apiKeyRequired: false,
		baseUrl: 'http://localhost:1234/v1',
		model: 'openai/gpt-oss-20b',
	},
	ollama: {
		apiKeyRequired: false,
		baseUrl: 'http://localhost:11434/v1',
		model: 'gpt-oss:20b',
	},
	openai: {
		apiKeyRequired: true,
		baseUrl: 'https://api.openai.com/v1',
		model: 'gpt-5.6',
	},
	xai: {
		apiKeyRequired: true,
		baseUrl: 'https://api.x.ai/v1',
		model: 'grok-4.5',
	},
	zhipu: {
		apiKeyRequired: true,
		baseUrl: 'https://api.z.ai/api/coding/paas/v4',
		model: 'glm-5.2',
	},
} as const;

export type ProviderName = keyof typeof providerDefaults;
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface NativeFileConfig {
	defaultProvider?: string;
	maxTurns?: number;
	providers?: Record<
		string,
		{
			apiKey?: string;
			baseUrl?: string;
			model?: string;
			/** Force streaming on/off for this provider (escape hatch for non-SSE endpoints). */
			stream?: boolean;
			/** Per-stream idle (no-bytes) timeout in ms before the request is treated as stalled. */
			streamIdleTimeoutMs?: number;
		}
	>;
}

/** One streamed completion fragment: assistant narration (`text`) or thinking (`reasoning`). */
export interface StreamDelta {
	kind: 'reasoning' | 'text';
	text: string;
}

export interface AgentLoopRequest {
	cwd: string;
	messages?: AgentMessage[];
	model?: string;
	prompt: string;
	reasoningEffort?: string;
	thinking?: boolean;
	thinkingLevel?: string;
	tools?: ToolDefinition[];
	/** 0-based agent-loop turn index, threaded through for diagnostics logging. */
	turn?: number;
}

export type AgentMessage =
	| { content: null | string; role: 'assistant'; toolCalls?: AgentToolCall[] }
	| { content: string; role: 'tool'; toolCallId: string }
	| { content: string; role: 'user' };

export interface AgentToolCall {
	arguments: string;
	id: string;
	name: string;
}

export interface ToolDefinition {
	function: {
		description: string;
		name: string;
		parameters: unknown;
	};
	type: 'function';
}

export interface AgentLoopResponse {
	/** Subset of inputTokens served from the prompt cache (priced at the cached rate). */
	cachedTokens?: number;
	events?: AgentEvent[];
	filesModified?: string[];
	inputTokens?: number;
	outputTokens?: number;
	/** Subset of outputTokens spent on reasoning (already priced at the output rate). */
	reasoningTokens?: number;
	text: string;
	toolCalls?: AgentToolCall[];
}

export interface AgentClient {
	/**
	 * `onDelta` (streaming clients only) is invoked synchronously per SSE fragment while the
	 * completion is in flight, so callers can surface live progress during a long turn. It is
	 * a separate argument — not a request field — to keep the request pure, cloneable data.
	 */
	complete(
		request: AgentLoopRequest,
		signal: AbortSignal,
		onDelta?: (delta: StreamDelta) => void,
	): Promise<AgentLoopResponse>;
}

export interface OpenAICompatibleClientConfig {
	apiKey?: string;
	baseUrl: string;
	/** Optional source context for structured AI call logging. */
	callSource?: 'aidd' | 'direct';
	/** Optional surface context for structured AI call logging. */
	callSurface?: AiCallSurface;
	fetch?: FetchLike;
	model: string;
	provider: string;
	/**
	 * Force streaming on/off. Defaults (when undefined) to streaming for remote
	 * providers and non-streaming for local ones (ollama/lmstudio). An escape
	 * hatch for a local server whose SSE implementation misbehaves.
	 */
	stream?: boolean;
	/** Per-stream idle (no-bytes) timeout in ms; falls back to DEFAULT_STREAM_IDLE_TIMEOUT_MS. */
	streamIdleTimeoutMs?: number;
}

export type ResolvedNativeClientConfig =
	{ config: OpenAICompatibleClientConfig; kind: 'openai-compatible' } | { kind: 'simulation' };

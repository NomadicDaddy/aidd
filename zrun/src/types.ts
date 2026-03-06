import type OpenAI from 'openai';

export interface ZRunConfig {
	apiKey: string;
	model: string;
	baseUrl: string;
	maxTurns: number;
}

export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
export type ToolDefinition = OpenAI.Chat.Completions.ChatCompletionTool;
export type ToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;

export interface ToolResult {
	tool_call_id: string;
	content: string;
}

export interface TokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	cachedTokens: number;
}

export interface SessionUsage {
	turns: number;
	totalPromptTokens: number;
	totalCompletionTokens: number;
	totalTokens: number;
	totalCachedTokens: number;
	lastPromptTokens: number;
	lastCompletionTokens: number;
	lastCachedTokens: number;
}

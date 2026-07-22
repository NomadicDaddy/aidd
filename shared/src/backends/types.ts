import type { BackendName } from '../plan/types.ts';

export interface PromptInput {
	cwd: string;
	heuristicMode?: 'default' | 'planning';
	model?: string;
	reasoningEffort?: string;
	simulation?: boolean;
	text: string;
	thinking?: boolean;
	thinkingLevel?: string;
}

export type AgentErrorReason =
	'aborted' | 'idle' | 'parse' | 'provider' | 'rate_limit' | 'spawn' | 'unknown';

export interface AgentErrorEvent {
	/** False for a recognized advisory; undefined is fail-closed but not explicitly fatal. */
	fatal?: boolean;
	meta?: unknown;
	reason: AgentErrorReason;
	type: 'error';
}

export type AgentEvent =
	| { afterMs: number; type: 'idle_warning' }
	| { args: unknown; tool: string; type: 'tool_call' }
	| { backend: BackendName; pid?: number; type: 'started' }
	| {
			cachedTokens?: number;
			costUsd?: number;
			inputTokens?: number;
			outputTokens?: number;
			reasoningTokens?: number;
			type: 'usage';
	  }
	// Incremental live-console text streamed mid-turn (native backend SSE). Presentation-only:
	// the turn's canonical full text still arrives as one `assistant_text`, so delta events are
	// excluded from transcripts/result parsing and consumed only by live renderers.
	| { chunk: string; kind: 'reasoning' | 'text'; type: 'assistant_delta' }
	| { chunk: string; stream: 'stderr' | 'stdout'; type: 'raw_log' }
	| { chunk: string; type: 'assistant_text' }
	| { exitCode: number; filesModified: string[]; type: 'done' }
	| { exitCode?: number; result: unknown; tool: string; type: 'tool_result' }
	| { raw?: unknown; resetAt?: string; type: 'rate_limit' }
	| AgentErrorEvent;

export interface CLIBackend {
	readonly idleDefaults: {
		killMs: number;
		nudgeMs: number;
	};
	readonly name: BackendName;
	runPrompt(input: PromptInput, signal: AbortSignal): AsyncIterable<AgentEvent>;
}

import type { AgentEvent } from 'aidd-shared/backends/types';

/**
 * What the agent said after its last tool call, read from the live stream while the text deltas
 * are still in order with the tool events. The loop drops deltas from the stored events, and some
 * parsers then emit the whole run's text as one assistant_text after every tool event (Grok), or
 * fall back to raw stdout when nothing parsed (codex, opencode-family, cline). Read from the stored
 * events, either of those looks like a final message and is not one (Morticia L1 on fdf0847).
 *
 * So the text is collected as it streams. A tool event starts it over. Where the backend streams
 * text deltas, the deltas are the text and any assistant_text is their duplicate or the aggregate.
 * Where it streams none, assistant_text is the text, but only if some of it came before a tool
 * call: text that appears only after every tool event, with none before, is the aggregate or the
 * raw fallback, and the message is empty. That last rule also drops a real report from a
 * non-streaming backend that said nothing before its tools, which is the safe side to err on.
 */
export interface FinalMessageTracker {
	observe: (event: AgentEvent) => void;
	text: () => string;
}

interface TrackerState {
	sawTextDelta: boolean;
	sawTool: boolean;
	spoke: boolean;
	spokeBeforeATool: boolean;
	trailing: string;
}

/** A tool call or result: everything said so far was before a tool, and the message restarts. */
function onTool(state: TrackerState): void {
	state.sawTool = true;
	if (state.spoke) state.spokeBeforeATool = true;
	state.trailing = '';
}

function onTextDelta(state: TrackerState, chunk: string): void {
	state.sawTextDelta = true;
	state.spoke = true;
	state.trailing += chunk;
}

/** Counted only when no deltas stream: with deltas, an assistant_text duplicates them. */
function onAssistantText(state: TrackerState, chunk: string): void {
	if (state.sawTextDelta || chunk.trim() === '') return;
	state.spoke = true;
	state.trailing = state.trailing === '' ? chunk : `${state.trailing}\n${chunk}`;
}

function observeEvent(state: TrackerState, event: AgentEvent): void {
	if (event.type === 'tool_call' || event.type === 'tool_result') onTool(state);
	else if (event.type === 'assistant_delta' && event.kind === 'text') {
		onTextDelta(state, event.chunk);
	} else if (event.type === 'assistant_text') onAssistantText(state, event.chunk);
}

function messageOf(state: TrackerState): string {
	const aggregateOnly = !state.sawTextDelta && state.sawTool && !state.spokeBeforeATool;
	return aggregateOnly ? '' : state.trailing.trim();
}

export function createFinalMessageTracker(): FinalMessageTracker {
	const state: TrackerState = {
		sawTextDelta: false,
		sawTool: false,
		spoke: false,
		spokeBeforeATool: false,
		trailing: '',
	};
	return {
		observe: (event) => observeEvent(state, event),
		text: () => messageOf(state),
	};
}

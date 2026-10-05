import type { AgentEvent } from '../types.ts';

import { getPath } from './plain-json.ts';

/**
 * Claude Code message content blocks. A `tool_result` names its call only by `tool_use_id`, so
 * the blocks are read with a map of the call ids seen so far: the result gets its tool's name,
 * and both events carry the id, which pairs a result with its own call even when subagent calls
 * interleave with the parent's or a call never reports back.
 */
export function parseContentBlocks(json: unknown, toolNames: Map<string, string>): AgentEvent[] {
	const events: AgentEvent[] = [];
	const content = getPath(json, ['message', 'content']) ?? getPath(json, ['content']);
	if (!Array.isArray(content)) return events;
	for (const block of content) {
		if (typeof block !== 'object' || block === null) continue;
		const record = block as Record<string, unknown>;
		const callId = typeof record.id === 'string' && record.id ? record.id : undefined;
		if (record.type === 'text') {
			if (typeof record.text === 'string' && record.text.length > 0) {
				events.push({ chunk: record.text, type: 'assistant_text' });
			}
		} else if (record.type === 'tool_use') {
			if (typeof record.name === 'string') {
				if (callId !== undefined) toolNames.set(callId, record.name);
				events.push({
					args: record.input,
					...(callId === undefined ? {} : { callId }),
					tool: record.name,
					type: 'tool_call',
				});
			}
		} else if (record.type === 'tool_result' && record.content !== undefined) {
			const useId =
				typeof record.tool_use_id === 'string' && record.tool_use_id
					? record.tool_use_id
					: undefined;
			events.push({
				...(useId === undefined ? {} : { callId: useId }),
				result: record.content,
				tool: (useId === undefined ? undefined : toolNames.get(useId)) ?? 'unknown',
				type: 'tool_result',
			});
		}
	}
	return events;
}

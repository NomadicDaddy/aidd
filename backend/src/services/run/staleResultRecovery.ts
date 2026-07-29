import { extractResultFromText } from 'aidd-shared/agent/result-marker';
import {
	hasUnfinalizedAgentResultMarker,
	unfinalizedAgentResultMarker,
} from 'aidd-shared/runs/outcome';
import { stripAnsi } from 'aidd-shared/text/ansi';
import { open } from 'node:fs/promises';

export const STALE_RESULT_LOG_TAIL_BYTES = 256 * 1024;

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function contentText(value: unknown): string | undefined {
	if (typeof value === 'string' && value.length > 0) return value;
	if (!Array.isArray(value)) return undefined;
	const parts = value
		.map((block) => {
			const record = asRecord(block);
			return record?.type === 'text' ? stringValue(record.text) : undefined;
		})
		.filter((part): part is string => part !== undefined);
	return parts.length > 0 ? parts.join('') : undefined;
}

function assistantMessageFromEnvelope(value: unknown): string | undefined {
	const envelope = asRecord(value);
	if (!envelope) return undefined;
	const item = asRecord(envelope.item);
	if (envelope.type === 'item.completed' && item?.type === 'agent_message') {
		return stringValue(item.text);
	}

	const message = asRecord(envelope.message);
	if (envelope.type === 'assistant') {
		return contentText(message?.content ?? envelope.content);
	}
	if (envelope.role === 'assistant') {
		return contentText(envelope.content ?? envelope.text);
	}
	if (message?.role === 'assistant') {
		return contentText(message.content ?? message.text);
	}
	if (item?.role === 'assistant') {
		return contentText(item.content ?? item.text);
	}

	// OpenCode/Kilo emit one structured assistant text part per message.
	const part = asRecord(envelope.part);
	if (envelope.type === 'text' && part) return stringValue(part.text);
	return undefined;
}

export function extractTerminalAgentResult(logTail: string): Record<string, unknown> | undefined {
	const stripped = stripAnsi(logTail);
	let terminalMessage: string | undefined;
	let grokMessage = '';
	for (const line of stripped.split(/\r?\n/)) {
		if (line.startsWith('[ASSISTANT]')) {
			terminalMessage = line.replace(/^\[ASSISTANT\]\s*/, '');
			grokMessage = '';
			continue;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			continue;
		}
		const envelope = asRecord(parsed);
		// Grok streams one assistant message as structured text deltas.
		if (envelope?.type === 'text') {
			const delta = stringValue(envelope.data);
			if (delta !== undefined) {
				grokMessage += delta;
				terminalMessage = grokMessage;
				continue;
			}
		}
		const message = assistantMessageFromEnvelope(parsed);
		if (message !== undefined) {
			terminalMessage = message;
			grokMessage = '';
		}
	}
	return terminalMessage === undefined
		? undefined
		: extractResultFromText(stripAnsi(terminalMessage));
}

export function appendRecoveredAgentResult(summary: null | string): string {
	if (hasUnfinalizedAgentResultMarker(summary)) return summary ?? '';
	// Persist only the classification signal, not the untrusted payload. The full claim remains in
	// the bounded run-log evidence; copying arbitrary result fields into the summary could leak
	// report content or inflate a row by hundreds of kilobytes.
	const marker = `${unfinalizedAgentResultMarker} final assistant message contained a parseable AIDD_RESULT object`;
	const current = summary?.trim();
	return current ? `${current}; ${marker}` : marker;
}

export async function recoverResultFromRunLog(
	logPath: null | string,
): Promise<Record<string, unknown> | undefined> {
	if (!logPath) return undefined;
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(logPath, 'r');
		const size = (await handle.stat()).size;
		if (size === 0) return undefined;
		const readLength = Math.min(size, STALE_RESULT_LOG_TAIL_BYTES + 1);
		const start = size - readLength;
		const buffer = Buffer.alloc(readLength);
		const { bytesRead } = await handle.read(buffer, 0, readLength, start);
		let tail = buffer.subarray(0, bytesRead).toString('utf8');
		if (start > 0) {
			const firstLineEnd = tail.indexOf('\n');
			if (firstLineEnd === -1) return undefined;
			tail = tail.slice(firstLineEnd + 1);
		}
		return extractTerminalAgentResult(tail);
	} catch {
		return undefined;
	} finally {
		await handle?.close().catch(() => {});
	}
}

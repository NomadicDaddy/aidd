import { extractResultFromText } from 'aidd-shared/agent/result-marker';
import {
	hasUnfinalizedAgentResultMarker,
	unfinalizedAgentResultMarker,
} from 'aidd-shared/runs/outcome';
import { stripAnsi } from 'aidd-shared/text/ansi';
import { open } from 'node:fs/promises';

export const STALE_RESULT_LOG_TAIL_BYTES = 256 * 1024;
/**
 * Ceiling for the adaptive widening in recoverResultFromRunLog. A batch audit's final
 * assistant message carries every report inline and can run to hundreds of kilobytes on
 * one line, so the starting window is a fast path rather than a limit.
 */
export const STALE_RESULT_LOG_MAX_TAIL_BYTES = 16 * 1024 * 1024;

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

/**
 * The last assistant message in a run-log window, decoded from whichever envelope shape the
 * backend writes. This is the run's own closing answer — the review report, the remediation
 * summary — as prose, with the surrounding NDJSON stripped.
 *
 * Split out of extractTerminalAgentResult because two callers want different halves of it: the
 * stale-result recovery wants the AIDD_RESULT embedded in the message, while a pipeline step
 * forwarding its findings to the next step wants the message itself.
 * @param logTail A window of the run log, tail-aligned. A leading partial line is tolerated.
 * @returns The final assistant message, or undefined when the window holds none.
 */
export function terminalAgentMessage(logTail: string): string | undefined {
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
	return terminalMessage;
}

export function extractTerminalAgentResult(logTail: string): Record<string, unknown> | undefined {
	const message = terminalAgentMessage(logTail);
	return message === undefined ? undefined : extractResultFromText(stripAnsi(message));
}

export function appendRecoveredAgentResult(summary: null | string, recovery?: string): string {
	if (hasUnfinalizedAgentResultMarker(summary)) return summary ?? '';
	// Persist only the classification signal and a count of whatever was replayed, never the
	// untrusted payload: copying arbitrary result fields into the summary could leak report
	// content or inflate a row by hundreds of kilobytes. The claim stays in the run-log evidence.
	//
	// The existing summary is the last heartbeat's progress line ("audit iteration started"),
	// which on its own reads as a run that died early. It died late — after the agent had
	// finished — so the marker leads and the stale progress line is demoted to context.
	//
	// The wording states only what was actually observed: a parseable object in the log's final
	// agent message. Nothing here validates it against the run's mode, and an audit payload can
	// still fail report validation wholesale, so it must not be called complete or successful.
	// What survived validation, if anything, is the caller's recovery note.
	const recoverySuffix = recovery === undefined ? '' : `; ${recovery}`;
	const marker = `${unfinalizedAgentResultMarker} the run log's final agent message carried a parseable AIDD_RESULT; the run process died before finalizing it${recoverySuffix}`;
	const current = summary?.trim();
	return current ? `${marker} (last progress: ${current})` : marker;
}

async function readLogTail(
	handle: Awaited<ReturnType<typeof open>>,
	size: number,
	tailBytes: number,
): Promise<string | undefined> {
	const readLength = Math.min(size, tailBytes + 1);
	const start = size - readLength;
	const buffer = Buffer.alloc(readLength);
	const { bytesRead } = await handle.read(buffer, 0, readLength, start);
	const tail = buffer.subarray(0, bytesRead).toString('utf8');
	if (start === 0) return tail;
	// The window landed mid-line; that fragment cannot parse, so drop it.
	const firstLineEnd = tail.indexOf('\n');
	return firstLineEnd === -1 ? undefined : tail.slice(firstLineEnd + 1);
}

export interface RecoveredRunLogEvidence {
	result: Record<string, unknown>;
}

export async function recoverRunLogEvidence(
	logPath: null | string,
): Promise<RecoveredRunLogEvidence | undefined> {
	if (!logPath) return undefined;
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(logPath, 'r');
		const size = (await handle.stat()).size;
		if (size === 0) return undefined;
		// A fixed tail silently recovers nothing exactly when the payload is largest: the one
		// line holding the result can be wider than the window, and the mid-line fragment the
		// window does land on has to be discarded. Widen until it parses, the whole file has
		// been read, or the ceiling is reached.
		let tailBytes = STALE_RESULT_LOG_TAIL_BYTES;
		for (;;) {
			const tail = await readLogTail(handle, size, tailBytes);
			const result = tail === undefined ? undefined : extractTerminalAgentResult(tail);
			if (result !== undefined) return { result };
			if (tailBytes >= size || tailBytes >= STALE_RESULT_LOG_MAX_TAIL_BYTES) return undefined;
			tailBytes = Math.min(tailBytes * 2, STALE_RESULT_LOG_MAX_TAIL_BYTES);
		}
	} catch {
		return undefined;
	} finally {
		await handle?.close().catch(() => {});
	}
}

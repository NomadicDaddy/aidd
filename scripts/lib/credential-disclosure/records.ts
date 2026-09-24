import { commandCredentialLabel } from './command.ts';
import { credentialLabel } from './paths.ts';

export interface DisclosureRecord {
	command?: string | undefined;
	id?: string | undefined;
	label?: string | undefined;
	line: number;
	output?: unknown;
	tool?: string | undefined;
	type: 'call' | 'result';
}

function object(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function string(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function argumentsObject(value: unknown): Record<string, unknown> {
	if (typeof value === 'string') {
		try {
			return object(JSON.parse(value)) ?? {};
		} catch {
			return {};
		}
	}
	return object(value) ?? {};
}

function requestLabel(tool: string | undefined, args: Record<string, unknown>): string | undefined {
	if (/^(?:write|edit|glob|list)/i.test(tool ?? '')) return undefined;
	const command = string(args.command ?? args.cmd);
	if (command) return commandCredentialLabel(command);
	// Search tools' pattern fields are never file operands.
	const path = string(args.file_path ?? args.path ?? args.filename);
	return path ? credentialLabel(path) : undefined;
}

/** Parse only protocol-owned fields. Never recurse into returned text or quoted transcripts. */
function extract(value: unknown, line: number): DisclosureRecord[] {
	const record = object(value);
	if (!record) return Array.isArray(value) ? value.flatMap((entry) => extract(entry, line)) : [];
	const type = string(record.type);
	if (type === 'item.completed' || type === 'item.started') return extract(record.item, line);
	if (type === 'assistant' || type === 'user')
		return extract(object(record.message)?.content, line);
	if (type === 'command_execution') {
		if (record.status !== 'completed') return [];
		const id = string(record.id);
		return [
			{
				command: string(record.command),
				id,
				label: commandCredentialLabel(string(record.command) ?? ''),
				line,
				tool: 'command_execution',
				type: 'call',
			},
			{
				id,
				line,
				output: record.aggregated_output,
				tool: 'command_execution',
				type: 'result',
			},
		];
	}
	if (type === 'tool_call' || type === 'tool_use' || type === 'function_call') {
		const tool = string(record.tool ?? record.name);
		const args = argumentsObject(record.args ?? record.input ?? record.arguments);
		return [
			{
				command: string(args.command ?? args.cmd),
				id: string(record.id ?? record.call_id ?? record.tool_use_id),
				label: requestLabel(tool, args),
				line,
				tool,
				type: 'call',
			},
		];
	}
	if (type === 'tool_result' || type === 'function_call_output') {
		return [
			{
				id: string(record.tool_use_id ?? record.call_id ?? record.id),
				line,
				output: record.result ?? record.content ?? record.output,
				tool: string(record.tool ?? record.name),
				type: 'result',
			},
		];
	}
	if (Array.isArray(record.events)) return extract(record.events, line);
	return [];
}

export function parseDisclosureRecords(lines: string[]): DisclosureRecord[] {
	const records: DisclosureRecord[] = [];
	const buffers = new Map<string, { line: number; text: string }>();
	const visit = (value: unknown, line: number): void => {
		if (Array.isArray(value)) {
			value.forEach((entry) => visit(entry, line));
			return;
		}
		const record = object(value);
		if (!record) return;
		if (record.type === 'raw_log' && typeof record.chunk === 'string') {
			const stream = string(record.stream) ?? 'stdout';
			const buffer = buffers.get(stream) ?? { line, text: '' };
			let chunkLine = buffer.text ? buffer.line : line;
			const chunks = (buffer.text + record.chunk).split('\n');
			const tail = chunks.pop() ?? '';
			for (const chunk of chunks) {
				try {
					records.push(...extract(JSON.parse(chunk), chunkLine));
				} catch {
					/* Human transport output. */
				}
				chunkLine = line;
			}
			buffers.set(stream, { line: chunkLine, text: tail });
			return;
		}
		if (Array.isArray(record.events)) {
			visit(record.events, line);
			return;
		}
		records.push(...extract(record, line));
	};
	// Iteration JSON can be pretty-printed; JSONL run logs consist of independent records.
	const first = lines.find((line) => line.trim() !== '')?.trim();
	let parsedDocument = false;
	if (first === '{' || first === '[') {
		try {
			visit(JSON.parse(lines.join('\n')), 1);
			parsedDocument = true;
		} catch {
			/* Read complete JSONL records below. */
		}
	}
	if (!parsedDocument)
		lines.forEach((line, index) => {
			try {
				visit(JSON.parse(line), index + 1);
			} catch {
				/* Human log output is not a protocol record. */
			}
		});
	for (const buffer of buffers.values()) {
		try {
			records.push(...extract(JSON.parse(buffer.text), buffer.line));
		} catch {
			/* Incomplete trailing output. */
		}
	}
	return records;
}

/**
 * The permission layer's refusal, which means the tool never ran — so there is no file content
 * for the result to be carrying and nothing was disclosed.
 *
 * `hasReturnedContent` asks only whether the payload is longer than a threshold, and a refusal
 * sentence clears it easily ("Permission to use Bash with command sed -n '1,60p' .env has been
 * denied." is 72 characters). Two denied reads of a `.env` therefore scored identically to two
 * successful ones and the gate asked for a rotation that nothing had exposed.
 *
 * Anchored at both ends, and `every` rather than `some` for composite payloads: a result is
 * excused only when the refusal is the whole of it. File content that merely quotes the sentence,
 * or a multi-part result with one real payload beside a refusal, still counts as returned content.
 * Every one of the 38 refusals across this install's 1,094 retained artifacts ends exactly here.
 */
export function isRefusedResult(value: unknown): boolean {
	if (typeof value === 'string')
		return /^Permission to use \S.*has been denied\.$/s.test(value.trim());
	if (Array.isArray(value)) return value.length > 0 && value.every(isRefusedResult);
	const record = object(value);
	if (!record) return false;
	const present = ['text', 'content', 'output', 'result', 'stdout'].filter(
		(key) => record[key] !== undefined,
	);
	return present.length > 0 && present.every((key) => isRefusedResult(record[key]));
}

/** Measure returned payloads only, never command strings, IDs, or protocol envelopes. */
export function hasReturnedContent(value: unknown): boolean {
	if (typeof value === 'string') return value.trim().length > 40;
	if (Array.isArray(value)) return value.some(hasReturnedContent);
	const record = object(value);
	if (!record) return false;
	return ['text', 'content', 'output', 'result', 'stdout'].some((key) =>
		hasReturnedContent(record[key]),
	);
}

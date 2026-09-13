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

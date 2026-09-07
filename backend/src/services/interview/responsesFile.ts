import { join } from 'node:path';

import { readTextOrNull } from '../fsHelpers.ts';
import { parseQuestions, QUESTION_BULLET_LINE } from './questionsFile.ts';

export interface ParsedResponseEntry {
	priority: string;
	prompt: string;
	response: string;
}

/**
 * `  Response: <text>` — the single-line form. The text after the colon is optional so that a bare
 * `  Response:` can introduce a fenced block; a bare colon with no block still parses to the empty
 * answer, which is what the pre-fence grammar produced for the same line.
 */
const RESPONSE_LINE = /^\s+Response:(?:\s(.*))?$/;
const FENCE_OPEN_LINE = /^\s*(~{3,})\s*$/;
const TILDE_ONLY_LINE = /^\s*(~+)\s*$/;
const BODY_INDENT = '  ';
const LINKED_RESPONSE_PATH = /\]\((responses\/(response[1-9]\d*\.md))\)/g;
const QUESTION_SECTION = /^##\s+Question\s*$/i;
const RESPONSE_SECTION = /^##\s+Response\s*$/i;

interface FencedBlock {
	body: string;
	next: number;
}

function readFencedBlock(lines: string[], start: number, fence: string): FencedBlock {
	const body: string[] = [];
	let index = start;
	while (index < lines.length) {
		const line = lines[index] ?? '';
		if (line.trim() === fence) return { body: body.join('\n'), next: index + 1 };
		body.push(line.startsWith(BODY_INDENT) ? line.slice(BODY_INDENT.length) : line);
		index += 1;
	}
	// Unterminated fence: take the rest of the file rather than dropping the answer.
	return { body: body.join('\n'), next: index };
}

/**
 * Parse `responses.md` into its answered entries.
 *
 * Two answer forms are recognized. A single-line answer sits on the `  Response:` line itself and is
 * trimmed, exactly as it was before fenced answers existed. A multi-line answer follows a bare
 * `  Response:` as a tilde-fenced block whose body is returned byte for byte, so an interior blank
 * line, leading whitespace on a continuation line, or a line that looks like a question bullet or a
 * markdown heading all survive.
 * @param content Raw `responses.md` text.
 * @returns One entry per question bullet in the file, in file order.
 */
function parseInlineResponses(content: string): ParsedResponseEntry[] {
	const entries: ParsedResponseEntry[] = [];
	const lines = content.split('\n').map((line) => line.replace(/\r$/, ''));
	let current: null | ParsedResponseEntry = null;
	let index = 0;
	let sawResponse = false;

	function finishCurrent(): void {
		if (current !== null && sawResponse) entries.push(current);
	}

	while (index < lines.length) {
		const line = lines[index] ?? '';
		const questionMatch = QUESTION_BULLET_LINE.exec(line);
		if (questionMatch) {
			finishCurrent();
			current = {
				priority: (questionMatch[1] ?? '').trim(),
				prompt: (questionMatch[2] ?? '').trim(),
				response: '',
			};
			sawResponse = false;
			index += 1;
			continue;
		}
		const responseMatch = RESPONSE_LINE.exec(line);
		if (responseMatch && current !== null) {
			sawResponse = true;
			const inline = responseMatch[1];
			const fence =
				inline === undefined ? FENCE_OPEN_LINE.exec(lines[index + 1] ?? '') : null;
			if (fence) {
				const block = readFencedBlock(lines, index + 2, fence[1] ?? '');
				current.response = block.body;
				index = block.next;
				continue;
			}
			current.response = (inline ?? '').trim();
			index += 1;
			continue;
		}
		index += 1;
	}

	finishCurrent();
	return entries;
}

function linkedResponsePaths(content: string): string[] {
	const paths: string[] = [];
	const seen = new Set<string>();
	for (const match of content.matchAll(LINKED_RESPONSE_PATH)) {
		const path = match[1];
		if (path === undefined || seen.has(path)) continue;
		seen.add(path);
		paths.push(path);
	}
	return paths;
}

function sectionBody(lines: string[], start: number, end: number): string {
	let first = start;
	let last = end;
	if ((lines[first] ?? '').trim() === '') first += 1;
	while (last > first && (lines[last - 1] ?? '').trim() === '') last -= 1;
	return lines.slice(first, last).join('\n');
}

function parseLinkedResponseDocument(content: string): ParsedResponseEntry[] {
	const lines = content.split('\n').map((line) => line.replace(/\r$/, ''));
	const questionIndex = lines.findIndex((line) => QUESTION_SECTION.test(line));
	const responseIndex = lines.findIndex(
		(line, index) => index > questionIndex && RESPONSE_SECTION.test(line),
	);
	if (questionIndex < 0 || responseIndex < 0) return [];

	const response = sectionBody(lines, responseIndex + 1, lines.length);
	if (response.length === 0) return [];
	return parseQuestions(sectionBody(lines, questionIndex + 1, responseIndex)).map((question) => ({
		priority: question.priority,
		prompt: question.prompt,
		response,
	}));
}

function responseKey(entry: ParsedResponseEntry): string {
	return `${entry.priority}\u0000${entry.prompt}`;
}

/**
 * Parse both response formats that aidd writes.
 *
 * Current web answers live inline in `responses.md`. CLI interview mode writes a progress table
 * whose completed rows link to `responses/responseN.md`; callers provide those linked documents so
 * every priority bullet covered by a response document resolves to its recorded answer. Inline
 * entries win if both formats happen to contain the same question during a migration.
 * @param content Raw `responses.md` text.
 * @param linkedDocuments Canonical relative response paths mapped to their Markdown content.
 * @returns Answered entries in file order.
 */
export function parseResponses(
	content: string,
	linkedDocuments: ReadonlyMap<string, string> = new Map(),
): ParsedResponseEntry[] {
	const byQuestion = new Map<string, ParsedResponseEntry>();
	for (const path of linkedResponsePaths(content)) {
		const document = linkedDocuments.get(path);
		if (document === undefined) continue;
		for (const entry of parseLinkedResponseDocument(document)) {
			byQuestion.set(responseKey(entry), entry);
		}
	}
	for (const entry of parseInlineResponses(content)) {
		byQuestion.set(responseKey(entry), entry);
	}
	return [...byQuestion.values()];
}

/**
 * Load only canonical CLI response links rooted under the selected project's metadata directory.
 * The strict link grammar prevents a Markdown link from turning this compatibility reader into an
 * arbitrary filesystem read.
 * @param metadataDir The selected project's `.aidd` directory.
 * @param content Raw `responses.md` text.
 * @returns Parsed inline and linked responses.
 */
export async function parseResponsesFromDisk(
	metadataDir: string,
	content: string,
): Promise<ParsedResponseEntry[]> {
	const documents = new Map<string, string>();
	await Promise.all(
		linkedResponsePaths(content).map(async (path) => {
			const document = await readTextOrNull(join(metadataDir, ...path.split('/')));
			if (document !== null) documents.set(path, document);
		}),
	);
	return parseResponses(content, documents);
}

/**
 * Pick a fence long enough that no line of the body can close the block early.
 *
 * `readFencedBlock` closes on a line whose trimmed form equals the opening fence, so a fence one
 * tilde longer than the longest tilde-only line in the body is unambiguous.
 * @param response The answer body about to be fenced.
 * @returns The fence token to open and close the block with.
 */
function fenceFor(response: string): string {
	let longest = 0;
	for (const line of response.split('\n')) {
		const match = TILDE_ONLY_LINE.exec(line);
		if (match) longest = Math.max(longest, (match[1] ?? '').length);
	}
	return '~'.repeat(Math.max(3, longest + 1));
}

function canUseSingleLine(response: string): boolean {
	return response.length > 0 && !response.includes('\n') && response.trim() === response;
}

/**
 * Render `responses.md` from the answered entries, in question order.
 *
 * Carriage returns are normalized here because the parser strips a trailing CR from every line:
 * this is the one place a file is written, so normalizing here is what guarantees every emitted
 * answer is one the parser reads back unchanged.
 * @param entries The answered entries to write, already ordered.
 * @returns The complete file text.
 */
export function serializeResponses(entries: readonly ParsedResponseEntry[]): string {
	const lines: string[] = [];
	for (const entry of entries) {
		const response = entry.response.replace(/\r\n?/g, '\n');
		lines.push(`- **[${entry.priority}]** ${entry.prompt}`);
		if (canUseSingleLine(response)) {
			lines.push(`  Response: ${response}`);
		} else {
			const fence = fenceFor(response);
			lines.push('  Response:');
			lines.push(`${BODY_INDENT}${fence}`);
			for (const bodyLine of response.split('\n')) {
				lines.push(bodyLine.length === 0 ? '' : `${BODY_INDENT}${bodyLine}`);
			}
			lines.push(`${BODY_INDENT}${fence}`);
		}
		lines.push('');
	}
	return lines.join('\n');
}

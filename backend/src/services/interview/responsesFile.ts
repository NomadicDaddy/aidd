import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { readTextOrNull } from '../fsHelpers.ts';
import { parseQuestions, QUESTION_BULLET_LINE } from './questionsFile.ts';

export interface ParsedResponseEntry {
	/** The `responses/responseN.md` the answer was read from; absent for an inline answer. */
	file?: string;
	/**
	 * Set only for a CLI response document whose question carries no priority bullet: the N of
	 * `responseN.md`, the question's place in questions.md, which the CLI and the panel share.
	 */
	number?: number;
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
const BODY_INDENT = '  ';
const LINKED_RESPONSE_PATH = /\]\((responses\/(response[1-9]\d*\.md))\)/g;
const CANONICAL_RESPONSE_PATH = /^responses\/response[1-9]\d*\.md$/;
const RESPONSE_FILE_NAME = /^response[1-9]\d*\.md$/;
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

/**
 * The N of `responses/responseN.md`; the link grammar guarantees the digits are there.
 * @param path A canonical linked response path.
 * @returns The document's question number.
 */
function responseNumber(path: string): number {
	return Number(/response([1-9]\d*)\.md$/.exec(path)?.[1]);
}

function sectionBody(lines: string[], start: number, end: number): string {
	let first = start;
	let last = end;
	if ((lines[first] ?? '').trim() === '') first += 1;
	while (last > first && (lines[last - 1] ?? '').trim() === '') last -= 1;
	return lines.slice(first, last).join('\n');
}

/**
 * The entries one linked document answers. An older CLI copied the question's priority bullet into
 * `## Question`, and those are matched by priority and prompt. The current CLI writes the
 * question's plain text there, which the agent may not copy exactly, so such a document is bound
 * by its number instead.
 * @param content The linked document's Markdown.
 * @param file Its canonical `responses/responseN.md` path.
 * @returns The answered entries it holds, none when it has no answer.
 */
function parseLinkedResponseDocument(content: string, file: string): ParsedResponseEntry[] {
	const number = responseNumber(file);
	const lines = content.split('\n').map((line) => line.replace(/\r$/, ''));
	const questionIndex = lines.findIndex((line) => QUESTION_SECTION.test(line));
	const responseIndex = lines.findIndex(
		(line, index) => index > questionIndex && RESPONSE_SECTION.test(line),
	);
	if (questionIndex < 0 || responseIndex < 0) return [];

	const response = sectionBody(lines, responseIndex + 1, lines.length);
	if (response.length === 0) return [];
	const questionText = sectionBody(lines, questionIndex + 1, responseIndex);
	const bullets = parseQuestions(questionText);
	if (bullets.length === 0) {
		return [{ file, number, priority: '', prompt: questionText, response }];
	}
	return bullets.map((question) => ({
		file,
		priority: question.priority,
		prompt: question.prompt,
		response,
	}));
}

function responseKey(entry: ParsedResponseEntry): string {
	if (entry.number !== undefined) return `#${entry.number}`;
	return `${entry.priority}\u0000${entry.prompt}`;
}

/**
 * Parse the answers a project holds.
 *
 * The CLI and the panel both keep each answer in `responses/responseN.md` and write `responses.md`
 * as a progress table linking them; callers provide those documents. A `responses.md` written by
 * the panel before that held its answers inline, and those are still read, so the next save can
 * move them into their files. Inline entries win if both forms hold the same question.
 * @param content Raw `responses.md` text.
 * @param linkedDocuments Canonical relative response paths mapped to their Markdown content.
 * @returns Answered entries in file order.
 */
export function parseResponses(
	content: string,
	linkedDocuments: ReadonlyMap<string, string> = new Map(),
): ParsedResponseEntry[] {
	const byQuestion = new Map<string, ParsedResponseEntry>();
	// The index may not link every answer file (the CLI counts a question answered when its file
	// exists), so a canonical document passed in is read whether or not the index names it.
	const documentPaths = [...linkedDocuments.keys()].filter((path) =>
		CANONICAL_RESPONSE_PATH.test(path),
	);
	for (const path of new Set([...linkedResponsePaths(content), ...documentPaths])) {
		const document = linkedDocuments.get(path);
		if (document === undefined) continue;
		for (const entry of parseLinkedResponseDocument(document, path)) {
			byQuestion.set(responseKey(entry), entry);
		}
	}
	const inline = new Map<string, ParsedResponseEntry>();
	for (const entry of parseInlineResponses(content)) {
		inline.set(responseKey(entry), entry);
		byQuestion.delete(responseKey(entry));
	}
	// Bind order: an inline answer, then a current numbered file, then an older bullet document.
	// A numbered file is matched by position, so it would otherwise take a question an inline answer
	// holds, and it is newer than any bullet document, which would otherwise shadow it.
	const documents = [...byQuestion.values()];
	return [
		...inline.values(),
		...documents.filter((entry) => entry.number !== undefined),
		...documents.filter((entry) => entry.number === undefined),
	];
}

/**
 * Load the canonical answer files under the selected project's metadata directory: those the index
 * links and any other `responses/responseN.md` present. The strict name grammar prevents a Markdown
 * link from turning this reader into an arbitrary filesystem read.
 * @param metadataDir The selected project's `.aidd` directory.
 * @param content Raw `responses.md` text, empty when the file is missing.
 * @returns Parsed inline and file responses.
 */
export async function parseResponsesFromDisk(
	metadataDir: string,
	content: string,
): Promise<ParsedResponseEntry[]> {
	const present = await readdir(join(metadataDir, 'responses')).catch(() => [] as string[]);
	const paths = new Set([
		...linkedResponsePaths(content),
		...present
			.filter((name) => RESPONSE_FILE_NAME.test(name))
			.map((name) => `responses/${name}`),
	]);
	const documents = new Map<string, string>();
	await Promise.all(
		[...paths].map(async (path) => {
			const document = await readTextOrNull(join(metadataDir, ...path.split('/')));
			if (document !== null) documents.set(path, document);
		}),
	);
	return parseResponses(content, documents);
}

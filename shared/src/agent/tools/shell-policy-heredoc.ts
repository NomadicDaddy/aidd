/**
 * Heredocs, for the tokenizer in `shell-policy-tokens.ts`. Bash reads a heredoc's body as text, so
 * neither an apostrophe nor a `#` in it means anything, and the command resumes on the line after
 * the terminator.
 */

/** `literal` when the delimiter was quoted, so bash expands nothing in the body. */
export interface Heredoc {
	delimiter: string;
	literal: boolean;
	stripTabs: boolean;
}

export interface HeredocBody {
	end: number;
	literal: boolean;
	start: number;
}

export interface HeredocBodies {
	bodies: HeredocBody[];
	/** The first code point after the last terminator. */
	cursor: number;
	terminated: boolean;
}

/** The delimiter word after `<<`, quotes and backslashes removed; `null` when there is none. */
export function peekDelimiter(
	chars: string[],
	from: number,
	endsWord: (ch: string) => boolean,
): null | Omit<Heredoc, 'stripTabs'> {
	let cursor = from;
	while (chars[cursor] === ' ' || chars[cursor] === '\t') cursor += 1;
	let delimiter = '';
	let literal = false;
	for (; cursor < chars.length; cursor += 1) {
		const ch = chars[cursor] as string;
		if (endsWord(ch)) break;
		if (ch === '"' || ch === "'") {
			const close = chars.indexOf(ch, cursor + 1);
			if (close === -1) return null;
			delimiter += chars.slice(cursor + 1, close).join('');
			cursor = close;
			literal = true;
		} else if (ch === '\\') {
			cursor += 1;
			delimiter += chars[cursor] ?? '';
			literal = true;
		} else {
			delimiter += ch;
		}
	}
	return delimiter === '' ? null : { delimiter, literal };
}

function lineEnd(chars: string[], from: number): number {
	const newline = chars.indexOf('\n', from);
	return newline === -1 ? chars.length : newline;
}

/** Reads each pending body in turn, starting on the line after the heredocs' command. */
export function readHeredocBodies(
	chars: string[],
	pending: Heredoc[],
	from: number,
): HeredocBodies {
	const bodies: HeredocBody[] = [];
	let cursor = from;
	let terminated = true;
	for (const { delimiter, literal, stripTabs } of pending) {
		const start = cursor;
		for (;;) {
			if (cursor >= chars.length) {
				terminated = false;
				break;
			}
			const end = lineEnd(chars, cursor);
			const line = chars.slice(cursor, end).join('');
			cursor = end + 1;
			if ((stripTabs ? line.replace(/^\t+/, '') : line) === delimiter) break;
		}
		bodies.push({ end: Math.min(cursor, chars.length), literal, start });
	}
	return { bodies, cursor, terminated };
}

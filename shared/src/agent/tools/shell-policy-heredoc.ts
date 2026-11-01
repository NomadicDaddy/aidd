/**
 * Heredocs, for the tokenizer in `shell-policy-tokens.ts`. Bash reads a heredoc's body as text, so
 * neither an apostrophe nor a `#` in it opens anything, and the command resumes on the line after
 * the terminator.
 */

export interface Heredoc {
	delimiter: string;
	stripTabs: boolean;
}

export interface HeredocBodies {
	/** The first code point after the last terminator. */
	cursor: number;
	terminated: boolean;
}

/** The delimiter word after `<<`, quotes and backslashes removed; `null` when there is none. */
export function peekDelimiter(
	chars: string[],
	from: number,
	endsWord: (ch: string) => boolean,
): null | string {
	let cursor = from;
	while (chars[cursor] === ' ' || chars[cursor] === '\t') cursor += 1;
	let delimiter = '';
	for (; cursor < chars.length; cursor += 1) {
		const ch = chars[cursor] as string;
		if (endsWord(ch)) break;
		if (ch === '"' || ch === "'") {
			const close = chars.indexOf(ch, cursor + 1);
			if (close === -1) return null;
			delimiter += chars.slice(cursor + 1, close).join('');
			cursor = close;
		} else if (ch === '\\') {
			cursor += 1;
			delimiter += chars[cursor] ?? '';
		} else {
			delimiter += ch;
		}
	}
	return delimiter === '' ? null : delimiter;
}

function lineEnd(chars: string[], from: number): number {
	const newline = chars.indexOf('\n', from);
	return newline === -1 ? chars.length : newline;
}

/** Finds where the pending bodies end, starting on the line after the heredocs' command. */
export function readHeredocBodies(
	chars: string[],
	pending: Heredoc[],
	from: number,
): HeredocBodies {
	let cursor = from;
	let terminated = true;
	for (const { delimiter, stripTabs } of pending) {
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
	}
	return { cursor, terminated };
}

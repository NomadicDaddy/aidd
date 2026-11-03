import { EMPTY_WORD, type ShellToken } from './shell-policy-tokens.ts';

/**
 * The stream the structure parser reads: each word the scan found, and each operator bash reads in
 * the gaps between them. Words in comments and heredoc bodies are left out, because bash never
 * reads them as commands; the expansion still judges them.
 */

export type ShellItem =
	| {
			/** No whitespace between this operator and the item before it. */
			glued: boolean;
			kind: 'op';
			op: string;
	  }
	| {
			glued: boolean;
			kind: 'word';
			/** The word's index in the scan's tokens, or undefined for a word quotes made empty. */
			token: number | undefined;
	  };

/** Bash's operators, longest first, so `&&` and `2>&1` lex as bash lexes them. */
const OPERATORS = [
	';;&',
	'&>>',
	'<<<',
	';;',
	';&',
	'&&',
	'||',
	'|&',
	'&>',
	'>>',
	'>&',
	'>|',
	'<<',
	'<&',
	'<>',
	';',
	'&',
	'|',
	'(',
	')',
	'<',
	'>',
	'\n',
];

export const REDIRECTIONS = new Set([
	'&>',
	'&>>',
	'<',
	'<&',
	'<<',
	'<<<',
	'<>',
	'>',
	'>&',
	'>>',
	'>|',
]);

/**
 * The items of a scanned command, or the reason bash's words and these can't be matched up.
 * Whitespace other than a space, tab or newline is part of a word to bash but ends one here, so a
 * gap holding it can't be read the way bash reads it.
 */
export function shellItems(tokens: ShellToken[], trailingGap: string): ShellItem[] | string {
	const items: ShellItem[] = [];
	for (const [index, token] of tokens.entries()) {
		if (token.inert) continue;
		const glued = readGap(token.gap, items);
		if (typeof glued === 'string') return glued;
		items.push({ glued, kind: 'word', token: index });
	}
	const trailing = readGap(trailingGap, items);
	return typeof trailing === 'string' ? trailing : items;
}

/**
 * Pushes the gap's operators and empty words. Returns whether the next word follows the gap with no
 * whitespace, or a problem.
 */
function readGap(gap: string, items: ShellItem[]): boolean | string {
	let glued = items.length > 0;
	for (let at = 0; at < gap.length;) {
		const ch = gap[at] as string;
		if (ch === ' ' || ch === '\t') {
			glued = false;
			at += 1;
		} else if (ch === EMPTY_WORD) {
			items.push({ glued, kind: 'word', token: undefined });
			glued = true;
			at += 1;
		} else {
			const op = OPERATORS.find((candidate) => gap.startsWith(candidate, at));
			if (op === undefined) return 'whitespace bash reads as part of a word';
			items.push({ glued, kind: 'op', op });
			glued = true;
			at += op.length;
		}
	}
	return glued;
}

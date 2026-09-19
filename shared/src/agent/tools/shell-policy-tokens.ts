/**
 * Quote-aware word splitting for the bash workspace policy.
 *
 * Every policy pass that reasons about arguments works on the same tokens, so a quoting trick that
 * fools one pass cannot succeed against another. Quotes are removed as they are consumed, so
 * `cat "../out"side.txt` yields the single token `../outside.txt` — the concatenation that defeats
 * a regex over the raw string.
 *
 * Backslash is left literal rather than treated as an escape. Under `bash -c` it is one, but
 * honoring it would erase the separator in Windows spellings like `..\outside.txt` and hand back
 * the harmless token `..outside.txt`. Leaving it literal can only over-split (an escaped space
 * becomes two tokens), and every extra token is one more thing that gets checked — the safe
 * direction.
 *
 * The one exception is a backslash sitting immediately before a quote character outside quotes.
 * Bash reads that as a literal quote, so opening a span on it leaves the span unterminated and
 * swallows the rest of the line into a single token, command separators included. That is how
 * `printf x \">/dev/null; cat ../outside.txt` hid its second command from every later pass. Both
 * characters stay in the token, so no separator is erased and a Windows path keeps its backslash.
 */

/**
 * Shell metacharacters that end an argument. `(`/`)` and `<`/`>` are included so
 * `cat <(cmd)`, `x>../y` and `(cd ..)` split into inspectable tokens rather than hiding a path
 * inside a longer blob.
 */
const OPERATOR_CHARS = new Set([';', '(', ')', '&', '<', '>', '|']);

/** Stands in for a whole quoted span in {@link ShellToken.unquoted}. */
export const QUOTED_SPAN = String.fromCharCode(2);

export interface ShellToken {
	/**
	 * The word bash would see, quotes removed. A `$` that sat inside single quotes is replaced by
	 * {@link PROTECTED_DOLLAR}, because single quotes are the one context bash never expands in.
	 */
	text: string;
	/**
	 * Only the characters that were outside quotes, each quoted span collapsed to
	 * {@link QUOTED_SPAN}. Brace expansion, globbing and `$'...'` quoting all act on this view.
	 */
	unquoted: string;
}

/** A `$` that bash will not expand because it was single-quoted. */
const PROTECTED_DOLLAR = String.fromCharCode(1);

export function tokenizeShell(command: string): ShellToken[] {
	const tokens: ShellToken[] = [];
	const chars = Array.from(command);
	let text = '';
	let unquoted = '';
	let quote: '"' | "'" | null = null;

	const flush = (): void => {
		if (text !== '') tokens.push({ text, unquoted });
		text = '';
		unquoted = '';
	};

	for (let index = 0; index < chars.length; index += 1) {
		const ch = chars[index];
		if (ch === undefined) continue;
		if (quote !== null) {
			if (ch === quote) quote = null;
			else text += quote === "'" && ch === '$' ? PROTECTED_DOLLAR : ch;
			continue;
		}
		const next = chars[index + 1];
		if (ch === '\\' && (next === '"' || next === "'")) {
			text += ch + next;
			unquoted += ch + next;
			index += 1;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			unquoted += QUOTED_SPAN;
			continue;
		}
		if (/\s/.test(ch) || OPERATOR_CHARS.has(ch)) {
			flush();
			continue;
		}
		text += ch;
		unquoted += ch;
	}
	flush();
	return tokens;
}

/** The literal spelling of a token once the single-quote protection is no longer needed. */
export function restoreProtectedDollars(text: string): string {
	return text.split(PROTECTED_DOLLAR).join('$');
}

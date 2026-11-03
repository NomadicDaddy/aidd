/**
 * Quote-aware word splitting for the bash workspace policy.
 *
 * Every policy pass that reasons about arguments works on the same tokens, so a quoting trick that
 * fools one pass cannot succeed against another. Quotes are removed as they are consumed, so
 * `cat "../out"side.txt` yields the single token `../outside.txt` — the concatenation that defeats
 * a regex over the raw string.
 *
 * Quote state follows bash, because any disagreement hides text from the policy: if `echo "a\""`
 * is read as ending at the escaped quote, the next quote opens a span that swallows the commands
 * after it. So a backslash escapes `"`, `$`, a backtick or a backslash inside double quotes, and
 * nothing inside single quotes. A comment or a heredoc body holds no quotes at all, which is why
 * an apostrophe in either one must not open a span.
 *
 * Their words are still judged, always. Four rounds of review found the same mistake: where this
 * scan reads a comment or a heredoc and bash doesn't (`(( a #b )) ; cat x`, `echo $[1<<E]` over a
 * line that runs), skipping the text hides a real command from every check. Bash's rules for both
 * need grammar a text scan lacks, so the only reading that can't hide one is to skip nothing. A
 * comment or heredoc naming an outside path or an unset variable is denied in exchange; a file
 * with such text goes through the file-writing tool.
 *
 * Outside quotes a backslash stays literal in the token rather than being removed. Under `bash -c`
 * it is an escape, but dropping it would erase the separator in Windows spellings like
 * `..\outside.txt` and hand back the harmless token `..outside.txt`. Leaving it can only over-split
 * (an escaped space becomes two tokens), and every extra token is one more thing that gets
 * checked. A backslash before a quote, a `<` or another backslash still pairs with it, as it does
 * in bash, so `\"` opens no span and `\\"` does, and `\<<` starts no heredoc.
 */

import { type Heredoc, peekDelimiter, readHeredocBodies } from './shell-policy-heredoc.ts';

/**
 * Shell metacharacters that end an argument. `(`/`)` and `<`/`>` are included so
 * `cat <(cmd)`, `x>../y` and `(cd ..)` split into inspectable tokens rather than hiding a path
 * inside a longer blob.
 */
const OPERATOR_CHARS = new Set([';', '(', ')', '&', '<', '>', '|']);
const TEXT_WORD_END = /[\s;()&<>|]+/;

/** Inside double quotes, the characters a backslash escapes. */
const DOUBLE_QUOTE_ESCAPES = new Set(['"', '\\', '`', '$']);

/** Stands in for a whole quoted span in {@link ShellToken.unquoted}. */
export const QUOTED_SPAN = String.fromCharCode(2);

/** Stands in for a word that quotes made empty (`""`), which {@link ShellToken.gap} keeps. */
export const EMPTY_WORD = String.fromCharCode(3);

export interface ShellToken {
	/**
	 * Everything bash reads between the previous word and this one: whitespace, operators
	 * (redirections and heredoc `<<` too) and {@link EMPTY_WORD}. The parser reads structure here.
	 */
	gap: string;
	/**
	 * A word from a comment or a heredoc body, which bash may not run as words. Its words are still
	 * judged, but nothing in it binds a variable.
	 */
	inert: boolean;
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

/** What bash reads as text rather than as words: `[start, end)` over the code points. */
interface Range {
	end: number;
	start: number;
}

interface QuotedRange extends Range {
	quote: '"' | "'";
}

interface Scan {
	/** Unquoted `((` not yet closed: `<<` inside is a shift, not a heredoc. */
	arithmetic: number;
	chars: string[];
	/** The gap since the last word; after the scan, the gap after the last word. */
	gap: string;
	index: number;
	pending: Heredoc[];
	problem: null | string;
	quoted: QuotedRange[];
	text: string;
	tokens: ShellToken[];
	unquoted: string;
}

/**
 * Word splitting here is wider than bash's on purpose: splitting on a form feed or a non-breaking
 * space only over-splits, and every extra token is checked.
 */
function endsWord(ch: string): boolean {
	return /\s/.test(ch) || OPERATOR_CHARS.has(ch);
}

/**
 * Where bash itself ends a word. Anything that decides what is text rather than words must use
 * this one: to bash, `a<NBSP>#` is one word, so reading that `#` as a comment hid the rest of the
 * line, and a form feed before a heredoc's delimiter is part of the delimiter.
 */
function endsBashWord(ch: string): boolean {
	return ch === ' ' || ch === '\t' || ch === '\n' || OPERATOR_CHARS.has(ch);
}

function flush(scan: Scan): void {
	if (scan.text !== '') {
		const { gap, text, unquoted } = scan;
		scan.tokens.push({ gap, inert: false, text, unquoted });
		scan.gap = '';
	} else if (scan.unquoted !== '') {
		scan.gap += EMPTY_WORD;
	}
	scan.text = '';
	scan.unquoted = '';
}

function readSingleQuoted(scan: Scan): void {
	const start = scan.index;
	scan.unquoted += QUOTED_SPAN;
	for (scan.index += 1; scan.index < scan.chars.length; scan.index += 1) {
		const ch = scan.chars[scan.index] as string;
		if (ch === "'") {
			scan.quoted.push({ end: scan.index + 1, quote: "'", start });
			return;
		}
		scan.text += ch === '$' ? PROTECTED_DOLLAR : ch;
	}
	scan.problem = 'an unterminated quote';
}

function readDoubleQuoted(scan: Scan): void {
	const start = scan.index;
	scan.unquoted += QUOTED_SPAN;
	for (scan.index += 1; scan.index < scan.chars.length; scan.index += 1) {
		const ch = scan.chars[scan.index] as string;
		if (ch === '"') {
			scan.quoted.push({ end: scan.index + 1, quote: '"', start });
			return;
		}
		const next = scan.chars[scan.index + 1];
		if (ch === '\\' && next !== undefined && DOUBLE_QUOTE_ESCAPES.has(next)) {
			scan.text += next === '$' ? PROTECTED_DOLLAR : next;
			scan.index += 1;
		} else {
			scan.text += ch;
		}
	}
	scan.problem = 'an unterminated quote';
}

/**
 * A comment holds no quotes, so an apostrophe in one opens no span, but its words are still judged.
 * Bash's rule for where a comment starts needs grammar a text scan lacks: `(( a = 1 #b )) ; cat x`
 * and `[[ x == @(a #b) ]] ; cat x` both run the `cat`. Each time this read a comment where bash
 * didn't, a real command vanished from every check, so the only reading that can't hide one is to
 * keep the text. A comment naming an outside path or an unset variable is denied in exchange.
 *
 * Leaves the index before the newline, which then ends the word stream as usual.
 */
function readComment(scan: Scan): void {
	const start = scan.index;
	while (scan.index < scan.chars.length && scan.chars[scan.index] !== '\n') scan.index += 1;
	pushTextWords(scan, start, scan.index);
	scan.index -= 1;
}

/** Text that holds no quotes to bash, read as words so the checks still see all of it. */
function pushTextWords(scan: Scan, start: number, end: number): void {
	const words = scan.chars.slice(start, end).join('').replace(/["']/g, '').split(TEXT_WORD_END);
	for (const text of words) {
		if (text !== '') scan.tokens.push({ gap: '', inert: true, text, unquoted: text });
	}
}

/** Called on the first `<` of `<<`. The delimiter word still tokenizes as an ordinary word. */
function noteHeredoc(scan: Scan): void {
	flush(scan);
	if (scan.chars[scan.index + 2] === '<') {
		scan.gap += '<<<';
		scan.index += 2;
		return;
	}
	scan.gap += '<<';
	const stripTabs = scan.chars[scan.index + 2] === '-';
	const delimiter = peekDelimiter(scan.chars, scan.index + (stripTabs ? 3 : 2), endsBashWord);
	if (delimiter !== null) scan.pending.push({ delimiter, stripTabs });
	scan.index += 1;
}

/** Called on the newline that ends a heredoc's command. Leaves the index on the terminator's end. */
function readHeredocs(scan: Scan): void {
	const { cursor, terminated } = readHeredocBodies(scan.chars, scan.pending, scan.index + 1);
	if (!terminated) scan.problem = 'a heredoc with no terminator';
	pushTextWords(scan, scan.index + 1, Math.min(cursor, scan.chars.length));
	scan.pending = [];
	scan.index = cursor - 1;
}

function startsComment(scan: Scan, ch: string): boolean {
	if (ch !== '#' || scan.text !== '' || scan.unquoted !== '') return false;
	const previous = scan.chars[scan.index - 1];
	if (previous === undefined) return true;
	return endsBashWord(previous) && !isEscaped(scan.chars, scan.index - 1);
}

/** An odd run of backslashes before a character escapes it, so `a\ #` is one word to bash. */
function isEscaped(chars: string[], index: number): boolean {
	let backslashes = 0;
	while (chars[index - 1 - backslashes] === '\\') backslashes += 1;
	return backslashes % 2 === 1;
}

function scanUnquoted(scan: Scan, ch: string): void {
	const next = scan.chars[scan.index + 1];
	if (ch === '\\' && (next === '"' || next === "'" || next === '\\' || next === '<')) {
		scan.text += ch + next;
		scan.unquoted += ch + next;
		scan.index += 1;
	} else if (ch === "'") {
		readSingleQuoted(scan);
	} else if (ch === '"') {
		readDoubleQuoted(scan);
	} else if (startsComment(scan, ch)) {
		readComment(scan);
	} else if (ch === '<' && next === '<' && scan.arithmetic === 0) {
		noteHeredoc(scan);
	} else if (endsWord(ch)) {
		flush(scan);
		scan.gap += ch;
		if (ch === '(' && next === '(') scan.arithmetic += 1;
		if (ch === ')' && next === ')') scan.arithmetic = Math.max(0, scan.arithmetic - 1);
		// `((` may be nested subshells instead, once bash finds no `))`, and then a `<<` skipped as
		// a shift was a heredoc. A line ending inside one can't be read either way.
		if (ch === '\n' && scan.arithmetic > 0) scan.problem = 'a `((` still open across lines';
		if (ch === '\n' && scan.pending.length > 0) readHeredocs(scan);
	} else {
		scan.text += ch;
		scan.unquoted += ch;
	}
}

export function scanShell(command: string): Scan {
	const scan: Scan = {
		arithmetic: 0,
		chars: Array.from(command),
		gap: '',
		index: 0,
		pending: [],
		problem: null,
		quoted: [],
		text: '',
		tokens: [],
		unquoted: '',
	};
	for (; scan.index < scan.chars.length; scan.index += 1) {
		scanUnquoted(scan, scan.chars[scan.index] as string);
	}
	flush(scan);
	if (scan.pending.length > 0) scan.problem = 'a heredoc with no terminator';
	return scan;
}

export function tokenizeShell(command: string): ShellToken[] {
	return scanShell(command).tokens;
}

/** Why bash and this policy could not agree on the command's words, or null when they can. */
export function shellSyntaxProblem(command: string): null | string {
	return scanShell(command).problem;
}

/** The literal spelling of a token once the single-quote protection is no longer needed. */
export function restoreProtectedDollars(text: string): string {
	return text.split(PROTECTED_DOLLAR).join('$');
}

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
 * Outside quotes a backslash stays literal in the token rather than being removed. Under `bash -c`
 * it is an escape, but dropping it would erase the separator in Windows spellings like
 * `..\outside.txt` and hand back the harmless token `..outside.txt`. Leaving it can only over-split
 * (an escaped space becomes two tokens), and every extra token is one more thing that gets
 * checked. A backslash before a quote or another backslash still pairs with it, as it does in bash,
 * so `\"` opens no span and `\\"` does.
 */

import { type Heredoc, peekDelimiter, readHeredocBodies } from './shell-policy-heredoc.ts';

/**
 * Shell metacharacters that end an argument. `(`/`)` and `<`/`>` are included so
 * `cat <(cmd)`, `x>../y` and `(cd ..)` split into inspectable tokens rather than hiding a path
 * inside a longer blob.
 */
const OPERATOR_CHARS = new Set([';', '(', ')', '&', '<', '>', '|']);

/** Characters that end one simple command and start the next. */
const COMMAND_SEPARATORS = new Set(['\n', ';', '(', ')', '&', '`', '|']);

/** Inside double quotes, the characters a backslash escapes. */
const DOUBLE_QUOTE_ESCAPES = new Set(['"', '\\', '`', '$']);

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

/** What bash reads as text rather than as words: `[start, end)` over the code points. */
interface Range {
	end: number;
	start: number;
}

interface QuotedRange extends Range {
	quote: '"' | "'";
}

interface InertRange extends Range {
	kind: 'comment' | 'expanding-body' | 'literal-body';
}

interface Scan {
	/** Unquoted `((` not yet closed: `<<` inside is a shift, not a heredoc. */
	arithmetic: number;
	chars: string[];
	index: number;
	/** Comments and heredoc bodies. */
	inert: InertRange[];
	pending: Heredoc[];
	problem: null | string;
	quoted: QuotedRange[];
	text: string;
	tokens: ShellToken[];
	unquoted: string;
}

function endsWord(ch: string): boolean {
	return /\s/.test(ch) || OPERATOR_CHARS.has(ch);
}

function flush(scan: Scan): void {
	if (scan.text !== '') scan.tokens.push({ text: scan.text, unquoted: scan.unquoted });
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

/** Leaves the index before the newline, which then ends the word stream as usual. */
function skipComment(scan: Scan): void {
	const start = scan.index;
	while (scan.index < scan.chars.length && scan.chars[scan.index] !== '\n') scan.index += 1;
	scan.inert.push({ end: scan.index, kind: 'comment', start });
	scan.index -= 1;
}

/** Called on the first `<` of `<<`. The delimiter word still tokenizes as an ordinary word. */
function noteHeredoc(scan: Scan): void {
	flush(scan);
	if (scan.chars[scan.index + 2] === '<') {
		scan.index += 2;
		return;
	}
	const stripTabs = scan.chars[scan.index + 2] === '-';
	const delimiter = peekDelimiter(scan.chars, scan.index + (stripTabs ? 3 : 2), endsWord);
	if (delimiter !== null) scan.pending.push({ ...delimiter, stripTabs });
	scan.index += 1;
}

/** Called on the newline that ends a heredoc's command. Leaves the index on the terminator's end. */
function skipHeredocBodies(scan: Scan): void {
	const { bodies, cursor, terminated } = readHeredocBodies(
		scan.chars,
		scan.pending,
		scan.index + 1,
	);
	if (!terminated) scan.problem = 'a heredoc with no terminator';
	for (const { end, literal, start } of bodies) {
		scan.inert.push({ end, kind: literal ? 'literal-body' : 'expanding-body', start });
	}
	scan.pending = [];
	scan.index = cursor - 1;
}

function scanUnquoted(scan: Scan, ch: string): void {
	const next = scan.chars[scan.index + 1];
	if (ch === '\\' && (next === '"' || next === "'" || next === '\\')) {
		scan.text += ch + next;
		scan.unquoted += ch + next;
		scan.index += 1;
	} else if (ch === "'") {
		readSingleQuoted(scan);
	} else if (ch === '"') {
		readDoubleQuoted(scan);
	} else if (ch === '#' && scan.text === '' && scan.unquoted === '') {
		skipComment(scan);
	} else if (ch === '<' && next === '<' && scan.arithmetic === 0) {
		noteHeredoc(scan);
	} else if (endsWord(ch)) {
		flush(scan);
		if (ch === '(' && next === '(') scan.arithmetic += 1;
		if (ch === ')' && next === ')') scan.arithmetic = Math.max(0, scan.arithmetic - 1);
		if (ch === '\n' && scan.pending.length > 0) skipHeredocBodies(scan);
	} else {
		scan.text += ch;
		scan.unquoted += ch;
	}
}

function scanShell(command: string): Scan {
	const scan: Scan = {
		arithmetic: 0,
		chars: Array.from(command),
		index: 0,
		inert: [],
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

/**
 * A heredoc body is input, not arguments, with two exceptions. `xargs` turns it back into arguments,
 * so its words are judged like any others, the way `echo ../x | xargs cat` is. And a body whose
 * delimiter is unquoted still expands, so a word with a `$` in it is judged like the same word on
 * the command line: `cat <<EOF` around `$SECRET` prints the secret.
 */
function heredocArguments(scan: Scan, command: string): ShellToken[] {
	const asArguments = /\bxargs\b/.test(command);
	return scan.inert.flatMap(({ end, kind, start }) => {
		const body = scan.chars.slice(start, end).join('');
		if (kind === 'comment') return [];
		if (asArguments) return tokenizeShell(body);
		if (kind === 'literal-body') return [];
		return (body.match(/\S*\$\S*/g) ?? []).map((text) => ({ text, unquoted: text }));
	});
}

export function tokenizeShell(command: string): ShellToken[] {
	const scan = scanShell(command);
	return [...scan.tokens, ...heredocArguments(scan, command)];
}

/** Why bash and this policy could not agree on the command's words, or null when they can. */
export function shellSyntaxProblem(command: string): null | string {
	return scanShell(command).problem;
}

/**
 * The command with each quoted span emptied, read the way bash reads it. `singleOnly` keeps the
 * content of double quotes, where `$HOME` and `$(...)` still expand. Comments and heredoc bodies
 * stay in the text, because the sweeps over this text are allowed to over-deny.
 */
export function stripQuotedSpans(command: string, singleOnly = false): string {
	const { chars, quoted } = scanShell(command);
	let out = '';
	let cursor = 0;
	for (const { end, quote, start } of quoted) {
		if (singleOnly && quote === '"') continue;
		out += chars.slice(cursor, start).join('') + quote + quote;
		cursor = end;
	}
	return out + chars.slice(cursor).join('');
}

/**
 * The simple commands bash would run, split where it splits them. A quoted separator stays in its
 * command, and comments and heredoc bodies are gone.
 */
export function commandSegments(command: string): string[] {
	const { chars, inert, quoted } = scanShell(command);
	const segments: string[] = [];
	let current = '';
	for (let index = 0; index < chars.length; index += 1) {
		const skipped = inert.find(({ end, start }) => index >= start && index < end);
		if (skipped !== undefined) {
			index = skipped.end - 1;
			continue;
		}
		const span = quoted.find(({ start }) => start === index);
		if (span !== undefined) {
			current += chars.slice(span.start, span.end).join('');
			index = span.end - 1;
		} else if (COMMAND_SEPARATORS.has(chars[index] as string)) {
			segments.push(current);
			current = '';
		} else {
			current += chars[index];
		}
	}
	segments.push(current);
	return segments;
}

/** The literal spelling of a token once the single-quote protection is no longer needed. */
export function restoreProtectedDollars(text: string): string {
	return text.split(PROTECTED_DOLLAR).join('$');
}

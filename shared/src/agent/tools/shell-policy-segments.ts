/**
 * Views of a command built on the scanner in `shell-policy-tokens.ts`, so the sweeps over raw text
 * and the splitting into simple commands agree with the tokens about what is quoted.
 */

import { scanShell } from './shell-policy-tokens.ts';

/** Characters that end one simple command and start the next. */
export const COMMAND_SEPARATORS = new Set(['\n', ';', '(', ')', '&', '`', '|']);

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

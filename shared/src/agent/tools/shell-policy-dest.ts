/**
 * Destination-argument parsing for the bash workspace policy.
 *
 * Split out of `shell-policy.ts` to keep both modules under the 300-line ceiling; the behavior
 * is unchanged. These checks are narrower than the general argument-containment sweep in
 * `shell-policy-args.ts` on purpose: they name the *write* target of a command, so their denial
 * message can say "writes outside workspace" rather than the generic "references".
 */

import { isPathWithinWorkspaceRoot } from './shell-policy-paths.ts';

/**
 * File-destination commands whose last non-flag argument is a destination path
 * that could escape the workspace. For `tee` and `dd of=` the destination is
 * parsed from the command string directly.
 */
const FILE_DEST_COMMANDS = ['cp', 'mv', 'install', 'ln', 'dd'] as const;

/**
 * Check destination arguments of file-copy/move/write commands.
 * For cp/mv/install, the last non-flag argument is the destination.
 * For ln, the optional second argument is the link destination.
 */
export function checkFileDestCommands(command: string, root: string): null | string {
	for (const cmd of FILE_DEST_COMMANDS) {
		// Match the command at word boundary, possibly after pipe/semicolon/background
		const cmdPattern = new RegExp(`(?:^|[;|&\`\\(]|\\s)${cmd}\\s+((?:\\S+\\s+)*\\S+)`, 'g');
		for (const match of command.matchAll(cmdPattern)) {
			if (match[1] === undefined) continue;
			const dest = parseLastDestArg(match[1]);
			if (dest !== null && !isPathWithinWorkspaceRoot(dest, root)) {
				return `ERROR: bash command writes outside workspace: ${dest}`;
			}
		}
	}
	return null;
}

/**
 * Parse the last non-flag argument from a command argument string.
 * For cp/mv/install/ln, flags are tokens starting with `-`.
 * The last non-flag token is the destination.
 */
function parseLastDestArg(argsStr: string): null | string {
	const tokens = tokenizeArgs(argsStr);
	// Walk backwards to find the last non-flag argument
	for (let i = tokens.length - 1; i >= 0; i--) {
		const token = stripSurroundingQuotes(tokens[i] ?? '');
		if (!token.startsWith('-')) {
			return token;
		}
	}
	return null;
}

/**
 * Parse the destination file from tee arguments.
 * tee [-a] [-i] [file...]
 * The first non-flag argument is the output file.
 */
export function parseTeeDestination(argsStr: string): null | string {
	const tokens = tokenizeArgs(argsStr);
	for (const token of tokens) {
		const stripped = stripSurroundingQuotes(token);
		// Skip flags
		if (stripped.startsWith('-')) continue;
		return stripped;
	}
	return null;
}

/**
 * Simple tokenization: split on whitespace, respecting surrounding quotes.
 */
function tokenizeArgs(argsStr: string): string[] {
	const tokens: string[] = [];
	let current = '';
	let inSingle = false;
	let inDouble = false;

	for (let i = 0; i < argsStr.length; i++) {
		const ch = argsStr[i];
		if (ch === "'" && !inDouble) {
			inSingle = !inSingle;
			current += ch;
		} else if (ch === '"' && !inSingle) {
			inDouble = !inDouble;
			current += ch;
		} else if (ch !== undefined && /\s/.test(ch) && !inSingle && !inDouble) {
			if (current) {
				tokens.push(current);
				current = '';
			}
		} else {
			current += ch;
		}
	}
	if (current) tokens.push(current);
	return tokens;
}

export function stripSurroundingQuotes(value: string): string {
	if (value.length >= 2) {
		const first = value[0];
		const last = value[value.length - 1];
		if ((first === '"' || first === "'") && first === last) {
			return value.slice(1, -1);
		}
	}
	return value;
}

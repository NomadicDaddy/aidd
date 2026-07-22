import { resolve } from 'node:path';

import { isPathWithinWorkspaceRoot } from './shell-policy-paths.ts';

/**
 * Home-directory / user-profile references. These expand (in bash, or PowerShell) to a
 * path outside the project workspace, so they cannot be statically bounded and are denied
 * outright — agents operate within the project and never legitimately need `$HOME`/`~`.
 * This is what stops `cat $HOME/.aidd/config.json` (and `~/.aidd/config.json`) from
 * exfiltrating the machine-local config (provider API keys, tokens). Generic `$VAR` /
 * `$(cmd)` usage is unaffected.
 *
 * On Windows the home directory is also reachable via `$HOMEDRIVE`/`$HOMEPATH` (which
 * concatenate to e.g. `C:\Users\name`), so those — in `$VAR`, `${VAR}`, `%VAR%`, and
 * `$env:VAR` forms — are denied alongside `$HOME`/`%USERPROFILE%`. The `\bHOME\b` anchor on
 * `$HOME` must NOT swallow `$HOMEDRIVE`/`$HOMEPATH`, which is why they are listed explicitly.
 */
const HOME_REFERENCE_PATTERN =
	/\$HOME\b|\$\{HOME[^}]*\}|\$HOMEDRIVE\b|\$HOMEPATH\b|\$\{HOMEDRIVE[^}]*\}|\$\{HOMEPATH[^}]*\}|%USERPROFILE%|%HOMEDRIVE%|%HOMEPATH%|\$env:(?:USERPROFILE|HOMEDRIVE|HOMEPATH)\b|(?:^|[\s;|&(`<>"'=])~/i;

/**
 * `printenv` prints environment variables to stdout, so `printenv HOME` (or
 * `printenv USERPROFILE`/`HOMEDRIVE`/`HOMEPATH`) leaks the home-directory path without ever
 * naming `$HOME` in a way HOME_REFERENCE_PATTERN would catch, and a bare `printenv` dumps the
 * entire environment (including HOME and any inherited secrets). Both forms are denied; a
 * targeted `printenv PATH` or similar non-home lookup is unaffected.
 */
const HOME_ENV_DUMP_PATTERN =
	/(?:^|[\s;|&(`])printenv(?:\s+(?:HOME|USERPROFILE|HOMEDRIVE|HOMEPATH)\b|(?=\s*(?:$|[;|&)`])))/i;

/**
 * Dangerous shell constructs that allow runtime string expansion which the
 * static lexical filter cannot inspect. Commands like `eval`, `bash -c`,
 * `source`, etc. accept arbitrary strings that are expanded at runtime —
 * meaning `$HOME` could be hidden inside a base64-encoded payload or
 * single-quoted argument to a subshell and would be invisible to the
 * HOME_REFERENCE_PATTERN check. These are denied outright: agents operate
 * within a single bash -c invocation and do not need nested eval/subshell
 * constructs.
 */
const DANGEROUS_CONSTRUCT_PATTERN =
	/(?:^|[\s;|&(`])eval\s|(?:^|[\s;|&(`])(?:bash|sh|dash|zsh|ksh)\s+-c\s|(?:^|[\s;|&(`])exec\s|(?:^|[\s;|&(`])source\s/;

/**
 * Encoding+eval chains: base64/base32/xxd/od piped into eval/bash/sh are the
 * standard bypass for static filters. Detected as the encoding command
 * appearing before an eval/subshell construct. Rather than trying to parse the
 * pipe chain, we deny any command containing both an encoding utility and a
 * runtime-eval construct in the same command string.
 */
const ENCODING_UTILITY_PATTERN = /\b(?:base64|base32|xxd|od)\b/;
const EVAL_CONSTRUCT_PATTERN =
	/\beval\b|\b(?:bash|sh|dash|zsh|ksh)\s+-c\b|\|\s*(?:bash|sh|dash|zsh|ksh)\b/;

/**
 * File-destination commands whose last non-flag argument is a destination path
 * that could escape the workspace. For `tee` and `dd of=` the destination is
 * parsed from the command string directly.
 */
const FILE_DEST_COMMANDS = ['cp', 'mv', 'install', 'ln', 'dd'] as const;

/**
 * Destructive git commands that discard uncommitted work without taking a path
 * argument (or with a bare `.` that means "everything"). These make the worktree
 * CLEANER rather than dirtier, so the write-allowlist diff (which compares dirty-path
 * sets) cannot detect them via path changes alone. Denied because they can silently
 * discard operator work outside the allowlisted paths.
 *
 * Matched forms:
 * - `git reset --hard [target]`     — discards all working-tree changes
 * - `git reset HEAD~N`              — rewinds HEAD without preserving changes as staged
 * - `git checkout .` / `git checkout -- .` — discards working-tree changes in cwd tree
 * - `git restore .` / `git restore -- .`   — same
 * - `git clean -f [-d] [-x] [.]`    — deletes untracked files
 */
const DESTRUCTIVE_GIT_PATTERN =
	/(?:^|[\s;|&(`])git\s+(?:reset\s+(?:--hard|HEAD~\d+)|checkout\s+(?:--\s+)?\.(?:\s|$)|restore\s+(?:--\s+)?\.(?:\s|$)|clean\s+-[a-z]*f[a-z]*)/;

export function checkBashWorkspacePolicy(command: string, cwd: string): null | string {
	const root = resolve(cwd);
	const stripped = command.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');

	// --- Destructive git command deny-list (Critical: silent worktree destruction) ---
	// git reset --hard, git checkout ., git restore ., git clean -fdx discard
	// uncommitted work without taking a path argument, so the write-allowlist guard's
	// dirty-path diff cannot detect them (they make the tree cleaner, not dirtier).
	if (DESTRUCTIVE_GIT_PATTERN.test(stripped)) {
		return 'ERROR: bash command uses a destructive git operation (e.g. git reset --hard, git checkout ., git clean) that can silently discard uncommitted work outside the write-allowlist boundary';
	}

	// --- Dangerous construct deny-list (Critical: eval/subshell/base64 bypass) ---
	// Block eval, bash -c, sh -c, exec, source, and dotted sourcing. These
	// constructs allow runtime string expansion that bypasses static filtering.
	if (DANGEROUS_CONSTRUCT_PATTERN.test(command)) {
		return 'ERROR: bash command uses a disallowed shell construct (eval, bash -c, exec, source) that bypasses static safety checks';
	}

	// Block encoding+eval chains: base64 piped into eval/bash etc.
	if (ENCODING_UTILITY_PATTERN.test(command) && EVAL_CONSTRUCT_PATTERN.test(command)) {
		return 'ERROR: bash command combines an encoding utility with an eval construct, which bypasses static safety checks';
	}

	// --- Home directory references ---
	// Check single-quote-stripped text: `$HOME` is literal inside single quotes
	// but expands inside double quotes, so double-quoted content must remain visible.
	const singleQuoteStripped = command.replace(/'[^']*'/g, "''");
	if (HOME_REFERENCE_PATTERN.test(singleQuoteStripped)) {
		return 'ERROR: bash command references a home directory (e.g. $HOME or ~), which is outside the workspace';
	}

	// Secondary check: also check the original (unmodified) command for HOME
	// references. This catches cases where $HOME appears inside a single-quoted
	// span consumed by a subshell (the single-quote stripping above would have
	// hidden it, but the subshell deny-list above already blocks the construct;
	// this is defense-in-depth).
	if (HOME_REFERENCE_PATTERN.test(command)) {
		return 'ERROR: bash command references a home directory (e.g. $HOME or ~), which is outside the workspace';
	}

	// --- Environment-dump deny-list (printenv HOME / bare printenv) ---
	// `printenv` writes env values to stdout, so it leaks the home path (and any inherited
	// secrets) without naming $HOME in a form the HOME_REFERENCE_PATTERN above would catch.
	if (HOME_ENV_DUMP_PATTERN.test(command)) {
		return 'ERROR: bash command uses printenv to read the home directory (or dump the environment), which is outside the workspace';
	}

	// --- Absolute path check ---
	const absolutePathPattern = /(?:^|[\s;|&(`])((?:\/|[A-Za-z]:[\\/])[^\s;|&)`'"]+)/g;
	for (const match of stripped.matchAll(absolutePathPattern)) {
		const token = match[1];
		if (token === undefined) continue;
		if (!isPathWithinWorkspaceRoot(token, root)) {
			return `ERROR: bash command references path outside workspace (${root}): ${token}`;
		}
	}

	// --- cd/pushd destination check ---
	const cdPattern = /(?:^|[;|&(`]|\s)(?:cd|pushd)\s+(?:--\s+)?("[^"]*"|'[^']*'|[^\s;|&)]+)/g;
	for (const match of command.matchAll(cdPattern)) {
		if (match[1] === undefined) continue;
		const target = stripSurroundingQuotes(match[1]);
		// `~`/`~/` are handled (denied) by HOME_REFERENCE_PATTERN above; `-` (previous dir)
		// and empty are benign relative navigations.
		if (target === '' || target === '-') continue;
		if (!isPathWithinWorkspaceRoot(target, root)) {
			return `ERROR: bash command 'cd' would escape workspace: ${target}`;
		}
	}

	// --- Redirect target check ---
	const redirectPattern = />>?\s*("[^"]*"|'[^']*'|[^\s;|&)]+)/g;
	for (const match of command.matchAll(redirectPattern)) {
		if (match[1] === undefined) continue;
		const target = stripSurroundingQuotes(match[1]);
		if (target.startsWith('&')) continue;
		if (!isPathWithinWorkspaceRoot(target, root)) {
			return `ERROR: bash command writes outside workspace: ${target}`;
		}
	}

	// --- File-destination command check (cp/mv/install/ln/tee/dd) ---
	// These commands accept a destination path as their last argument, so validate it separately
	// from redirects to block writes such as `cp file.txt ../outside.txt`.
	const fileDestError = checkFileDestCommands(command, root);
	if (fileDestError) return fileDestError;

	// --- tee destination check ---
	const teePattern = /(?:^|[;|&(`]|\s)tee\s+(.*?)$/s;
	const teeMatch = command.match(teePattern);
	if (teeMatch) {
		// tee arguments: flags (-a, -i, etc.) followed by optional file path
		const teeArgs = teeMatch[1];
		if (teeArgs !== undefined) {
			const teeDest = parseTeeDestination(teeArgs);
			if (teeDest !== null && !isPathWithinWorkspaceRoot(teeDest, root)) {
				return `ERROR: bash command writes outside workspace: ${teeDest}`;
			}
		}
	}

	return null;
}

/**
 * Check destination arguments of file-copy/move/write commands.
 * For cp/mv/install, the last non-flag argument is the destination.
 * For ln, the optional second argument is the link destination.
 */
function checkFileDestCommands(command: string, root: string): null | string {
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
function parseTeeDestination(argsStr: string): null | string {
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

function stripSurroundingQuotes(value: string): string {
	if (value.length >= 2) {
		const first = value[0];
		const last = value[value.length - 1];
		if ((first === '"' || first === "'") && first === last) {
			return value.slice(1, -1);
		}
	}
	return value;
}

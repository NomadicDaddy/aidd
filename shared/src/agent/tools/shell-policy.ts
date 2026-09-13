import { resolve } from 'node:path';

import { checkArgumentContainment, usesCommandSubstitution } from './shell-policy-args.ts';
import { denialMessage } from './shell-policy-denial.ts';
import {
	checkFileDestCommands,
	parseTeeDestination,
	stripSurroundingQuotes,
} from './shell-policy-dest.ts';
import { expandsAtRuntime, isPathWithinWorkspaceRoot } from './shell-policy-paths.ts';
import { maskNullOutputRedirects } from './shell-policy-redirects.ts';

/**
 * Environment variables that name a directory outside the project. Each one is supplied to the
 * tool subprocess by `buildToolSubprocessEnv` (see `subprocess-env.ts`), so a reference is not
 * hypothetical — bash will expand it. They cannot be statically bounded and are denied outright;
 * agents operate within the project and never legitimately need them.
 *
 * This is what stops `cat $HOME/.aidd/config.json` (and `~/.aidd/config.json`,
 * `$USERPROFILE/...`, `$APPDATA/...`) from exfiltrating the machine-local config (provider API
 * keys, tokens) with a denial that names the home directory. Every other variable is handled by
 * the containment sweep's static expansion (`shell-policy-expansion.ts`): a reference the command
 * itself binds is expanded and judged, and one it does not (`$TEMP`, `$SystemRoot`) is denied.
 *
 * The Windows home-drive and home-path variables concatenate to a user-profile path, so they also
 * belong in this list; the `\b` anchor keeps the shorter variable name from swallowing them.
 */
const HOME_VARIABLE_NAMES = [
	'HOME',
	'HOMEDRIVE',
	'HOMEPATH',
	'USERPROFILE',
	'APPDATA',
	'LOCALAPPDATA',
];

/**
 * Every spelling bash, cmd and PowerShell accept for those names — `$VAR`, `${VAR}` (with any
 * default/alternate suffix), `%VAR%`, `$env:VAR` — plus a leading `~`.
 */
const HOME_REFERENCE_PATTERN = buildHomeReferencePattern();

function buildHomeReferencePattern(): RegExp {
	const names = HOME_VARIABLE_NAMES.join('|');
	return new RegExp(
		[
			`\\$(?:${names})\\b`,
			`\\$\\{(?:${names})[^}]*\\}`,
			`%(?:${names})%`,
			`\\$env:(?:${names})\\b`,
			// A `~` only expands at the start of a word, which is why it is anchored to a
			// delimiter: `HEAD~1` and `file~` are ordinary arguments.
			'(?:^|[\\s;|&(`<>"\'=])~',
		].join('|'),
		'i',
	);
}

/**
 * `printenv` prints environment variables to stdout, so `printenv HOME` (or any other
 * home-directory variable) leaks the path without ever naming `$HOME` in a way
 * HOME_REFERENCE_PATTERN would catch, and a bare `printenv` dumps the entire environment
 * (including HOME and any inherited secrets). Both forms are denied; a targeted `printenv PATH`
 * or similar non-home lookup is unaffected.
 */
const HOME_ENV_DUMP_PATTERN = new RegExp(
	`(?:^|[\\s;|&(\`])printenv(?:\\s+(?:${HOME_VARIABLE_NAMES.join('|')})\\b|(?=\\s*(?:$|[;|&)\`])))`,
	'i',
);

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
	// Policy sees literal >/dev/null output sinks blanked; runBash still executes `command`.
	const violation = evaluateBashWorkspacePolicy(maskNullOutputRedirects(command), cwd);
	return violation === null ? null : denialMessage(violation);
}

/**
 * Check order is load-bearing. The narrow, position-aware checks run first so their specific
 * denial text ("'cd' would escape workspace", "writes outside workspace", "expanded at runtime")
 * survives; the general containment sweep runs last as the catch-all for every argument the
 * named checks do not cover.
 */
function evaluateBashWorkspacePolicy(command: string, cwd: string): null | string {
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
	const homeError = checkHomeReferences(command, singleQuoteStripped);
	if (homeError !== null) return homeError;

	// --- Absolute path check ---
	const absolutePathPattern = /(?:^|[\s;|&(`])((?:\/|[A-Za-z]:[\\/])[^\s;|&)`'"]+)/g;
	for (const match of stripped.matchAll(absolutePathPattern)) {
		const token = match[1];
		if (token === undefined) continue;
		if (!isPathWithinWorkspaceRoot(token, root)) {
			return `ERROR: bash command references path outside workspace (${root}): ${token}`;
		}
	}

	const positional = checkPositionalTargets(command, root);
	if (positional !== null) return positional;

	// --- Command substitution (the generic form of the `cd "$(...)"` hole) ---
	// Runs after the positional checks so `cd "$(...)"` keeps its more specific "expanded at
	// runtime" wording. Single-quoted spans are removed first: quoting suppresses expansion, so
	// a literal search like `rg '[$](x)' src/` is not substitution.
	if (usesCommandSubstitution(singleQuoteStripped)) {
		return 'ERROR: bash command uses command substitution ($(...) or backticks), whose value is produced at runtime and cannot be bounded to the workspace';
	}

	// --- General argument containment (relative escapes, quoted absolutes, symlinks) ---
	return checkArgumentContainment(command, root);
}

function checkHomeReferences(command: string, singleQuoteStripped: string): null | string {
	const denial =
		'ERROR: bash command references a home directory (e.g. $HOME, $USERPROFILE or ~), which is outside the workspace';
	if (HOME_REFERENCE_PATTERN.test(singleQuoteStripped)) return denial;
	// Secondary check: also check the original (unmodified) command for HOME references. This
	// catches cases where $HOME appears inside a single-quoted span consumed by a subshell (the
	// single-quote stripping above would have hidden it, but the subshell deny-list already
	// blocks the construct; this is defense-in-depth).
	if (HOME_REFERENCE_PATTERN.test(command)) return denial;

	// --- Environment-dump deny-list (printenv HOME / bare printenv) ---
	// `printenv` writes env values to stdout, so it leaks the home path (and any inherited
	// secrets) without naming $HOME in a form the HOME_REFERENCE_PATTERN above would catch.
	if (HOME_ENV_DUMP_PATTERN.test(command)) {
		return 'ERROR: bash command uses printenv to read the home directory (or dump the environment), which is outside the workspace';
	}
	return null;
}

/** The position-aware checks: `cd`/`pushd` destinations, redirects, and write destinations. */
function checkPositionalTargets(command: string, root: string): null | string {
	// --- cd/pushd destination check ---
	const cdPattern = /(?:^|[;|&(`]|\s)(?:cd|pushd)\s+(?:--\s+)?("[^"]*"|'[^']*'|[^\s;|&)]+)/g;
	for (const match of command.matchAll(cdPattern)) {
		const raw = match[1];
		if (raw === undefined) continue;
		const target = stripSurroundingQuotes(raw);
		// `~`/`~/` are handled (denied) by HOME_REFERENCE_PATTERN above; `-` (previous dir)
		// and empty are benign relative navigations.
		if (target === '' || target === '-') continue;
		// Single quotes suppress expansion in bash, so `cd '$lit'` really is a literal name.
		if (!raw.startsWith("'") && expandsAtRuntime(target)) {
			return `ERROR: bash command 'cd' target is expanded at runtime and cannot be bounded to the workspace: ${target}`;
		}
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

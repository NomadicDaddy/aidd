/**
 * Destructive git commands, recognised from the words bash would run.
 *
 * These discard uncommitted work without naming a path the write-allowlist diff can see: they make
 * the tree cleaner, not dirtier. The check used to be one regex over the raw command, and every
 * spelling it did not literally contain went through. It now splits the command into simple
 * commands, finds each `git` word, and judges every subcommand it could be running by its
 * arguments. Where the text cannot settle the question (a variable in a judged command, an option
 * of unknown arity, a quote that may or may not be real) it takes the reading that denies.
 *
 * Deliberately allowed: a path-limited discard (`git checkout -- src/x.ts`), which the allowlist
 * diff does see; `git stash`, which keeps the work; `git restore --staged`, which only unstages; a
 * reset to a plain ref or commit hash, which cannot be told from a path by its spelling; and a
 * destructive command behind a git alias.
 */

import { posix } from 'node:path';

import { tokenizeShell } from './shell-policy-tokens.ts';

/** Global options that take no value. Any other option without `=` may consume the next word. */
const VALUELESS_GLOBAL_OPTIONS = new Set([
	'--bare',
	'--glob-pathspecs',
	'--help',
	'--icase-pathspecs',
	'--literal-pathspecs',
	'--no-advice',
	'--no-lazy-fetch',
	'--no-optional-locks',
	'--no-pager',
	'--no-replace-objects',
	'--noglob-pathspecs',
	'--paginate',
	'--version',
	'-h',
	'-p',
	'-v',
]);

/** Subcommands whose trailing words are themselves a command line that git will run. */
const RUNS_A_COMMAND = new Set(['bisect', 'filter-branch', 'rebase', 'submodule']);

/** Characters that end one simple command and start the next. */
const COMMAND_SEPARATORS = new Set(['\n', ';', '(', ')', '&', '`', '|']);

/** Splits on command separators, honouring quotes or not. */
export function simpleCommands(command: string, honourQuotes: boolean): string[] {
	const commands: string[] = [];
	let current = '';
	let quote: '"' | "'" | null = null;
	for (const ch of command) {
		if (quote !== null) {
			if (ch === quote) quote = null;
			current += ch;
		} else if (honourQuotes && (ch === '"' || ch === "'")) {
			quote = ch;
			current += ch;
		} else if (COMMAND_SEPARATORS.has(ch)) {
			commands.push(current);
			current = '';
		} else {
			current += ch;
		}
	}
	commands.push(current);
	return commands;
}

/** Bash drops a backslash inside a word, so `g\it` and `--ha\rd` run as `git` and `--hard`. */
function unescaped(word: string): string {
	return word.split('\\').join('');
}

function isGitBinary(word: string): boolean {
	const name = word.split(/[\\/]/).pop()?.toLowerCase() ?? '';
	const plain = unescaped(word).toLowerCase();
	return name === 'git' || name === 'git.exe' || plain === 'git' || plain === 'git.exe';
}

/** True for `--hard`, and for any abbreviation of it that git would accept. */
function isOption(arg: string, name: string): boolean {
	const spelled = arg.split('=')[0] ?? arg;
	return spelled === name || (spelled.length >= 3 && name.startsWith(spelled));
}

function hasOption(args: string[], ...names: string[]): boolean {
	return args.some((arg) => names.some((name) => isOption(arg, name)));
}

/** True when a short-option cluster such as `-fd` or `-SW` carries the given letter. */
function hasShortFlag(args: string[], letter: string): boolean {
	return args.some((arg) => /^-[A-Za-z]+$/.test(arg) && arg.includes(letter));
}

/**
 * `.`, `./.`, `src/..`, `:/`, `:(top)` and any glob can reach the whole tree. A glob is not
 * expanded here, so every glob counts.
 */
function namesWholeTree(args: string[]): boolean {
	return args.some((arg) => {
		if (arg.startsWith('-')) return false;
		if (arg.startsWith(':') || /[*?[]/.test(arg)) return true;
		const normalized = posix.normalize(arg);
		return normalized === '.' || normalized === './' || normalized.startsWith('..');
	});
}

function resetDiscards(args: string[]): boolean {
	if (hasOption(args, '--hard', '--keep', '--merge')) return true;
	if (hasOption(args, '--soft')) return false;
	// A revision that walks back from a ref rewinds HEAD. Words after `--` are paths.
	const separator = args.indexOf('--');
	const revisions = separator === -1 ? args : args.slice(0, separator);
	return revisions.some((arg) => !arg.startsWith('-') && /[~^]|@\{/.test(arg));
}

function cleanDeletes(args: string[]): boolean {
	// The word after an exclude option is a pattern, so `-e -n` and `-fe -n` are not dry runs.
	const takesPattern = (arg: string) =>
		isOption(arg, '--exclude') || (/^-[A-Za-z]+$/.test(arg) && arg.endsWith('e'));
	const flags = args.filter((_, index) => !takesPattern(args[index - 1] ?? ''));
	const dryRun = flags.includes('--dry-run') || hasShortFlag(flags, 'n');
	if (dryRun && !hasOption(flags, '--no-dry-run')) return false;
	return hasOption(flags, '--force') || hasShortFlag(flags, 'f');
}

function restoreDiscards(args: string[]): boolean {
	if (!namesWholeTree(args)) return false;
	const staged = hasOption(args, '--staged') || hasShortFlag(args, 'S');
	const worktree = hasOption(args, '--worktree') || hasShortFlag(args, 'W');
	// `--staged` alone only unstages; the working tree is untouched.
	return !staged || worktree;
}

function forces(args: string[]): boolean {
	return hasOption(args, '--force') || hasShortFlag(args, 'f');
}

function isDestructive(subcommand: string, args: string[]): boolean {
	switch (subcommand) {
		case 'checkout':
			return forces(args) || namesWholeTree(args);
		case 'checkout-index':
			return forces(args) || hasShortFlag(args, 'a') || hasOption(args, '--all');
		case 'clean':
			return cleanDeletes(args);
		case 'read-tree':
			return hasOption(args, '--reset') || hasShortFlag(args, 'u');
		case 'reset':
			return resetDiscards(args);
		case 'restore':
			return restoreDiscards(args);
		case 'switch':
			return forces(args) || hasOption(args, '--discard-changes');
		default:
			return false;
	}
}

const JUDGED = new Set([
	'checkout',
	'checkout-index',
	'clean',
	'read-tree',
	'reset',
	'restore',
	'switch',
]);

/**
 * Judges one git invocation, given the words after `git`. A global option of unknown arity may
 * or may not swallow the next word, so every word that could be the subcommand is tried.
 */
function invocationDiscards(words: string[]): boolean {
	let mayBeValue = false;
	for (let index = 0; index < words.length; index += 1) {
		const word = words[index];
		if (word === undefined) break;
		const args = words.slice(index + 1);
		// A variable where the subcommand goes could name any of them. The value of `-C` or
		// `-c` is known to be a value, so `git -C "$dir" status` stays usable.
		const knownValue = ['-c', '-C'].includes(words[index - 1] ?? '');
		if (word.includes('$') && !knownValue) return true;
		if (JUDGED.has(word)) {
			// A variable in a judged command could expand to any flag or pathspec.
			if (args.some((arg) => arg.includes('$')) || isDestructive(word, args)) return true;
		}
		// `--exec=git reset --hard` carries its command after the equals sign.
		const trailing = args.join(' ').split('=').join(' ');
		if (RUNS_A_COMMAND.has(word) && usesDestructiveGit(trailing)) return true;
		if (word.startsWith('-')) {
			mayBeValue = !word.includes('=') && !VALUELESS_GLOBAL_OPTIONS.has(word);
		} else if (mayBeValue) {
			mayBeValue = false;
		} else {
			break;
		}
	}
	return false;
}

function segmentDiscards(segment: string): boolean {
	const words = tokenizeShell(segment).map((token) => unescaped(token.text));
	// `clean.requireForce=false` makes a bare `git clean` delete, with no force flag to see.
	if (/clean\.requireforce/i.test(segment) && words.includes('clean')) return true;
	const fedByXargs = words.includes('xargs');
	for (let index = 0; index < words.length; index += 1) {
		const word = words[index];
		// A variable may hold `git`; what follows it is judged as if it did.
		if (word === undefined || (!isGitBinary(word) && !word.startsWith('$'))) continue;
		const rest = words.slice(index + 1);
		if (invocationDiscards(rest)) return true;
		// xargs appends its input as arguments, so a judged subcommand, or none yet, can be
		// completed into a destructive one by text this check never sees.
		const subcommand = rest.find((candidate) => !candidate.startsWith('-'));
		if (fedByXargs && (subcommand === undefined || JUDGED.has(subcommand))) return true;
	}
	return false;
}

export function usesDestructiveGit(command: string): boolean {
	// A quote inside a comment or after a backslash is not a real quote, and reading it as one
	// hides the next command. Both readings are checked, and either can deny.
	for (const honourQuotes of [true, false]) {
		for (const segment of simpleCommands(command, honourQuotes)) {
			if (segmentDiscards(segment)) return true;
		}
	}
	return false;
}

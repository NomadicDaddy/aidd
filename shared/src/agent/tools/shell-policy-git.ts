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
 * diff does see; `git stash`, which keeps the work; `git restore --staged` and `git rm --cached`,
 * which only unstage; a reset to a plain ref or commit hash, which cannot be told from a path by
 * its spelling; and a destructive command behind a git alias.
 */

import { gitReadings } from './shell-policy-git-input.ts';
import { isDestructive, JUDGED } from './shell-policy-git-options.ts';
import { commandPositions, commandWord, isAssignment } from './shell-policy-shells.ts';
import { QUOTED_SPAN, tokenizeShell } from './shell-policy-tokens.ts';

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

/**
 * Commands whose quoted arguments are text to print or search for, never a command to run. Any
 * other command given a quoted string that spells a destructive git command (`pwsh -c "..."`,
 * `node -e '...'`, `awk 'BEGIN{system("...")}'`) is taken to run it.
 */
const QUOTES_ARE_TEXT = new Set([
	'ag',
	'echo',
	'egrep',
	'fgrep',
	'findstr',
	'git',
	'grep',
	'printf',
	'rg',
]);

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

function fileName(word: string): string {
	return (word.split(/[\\/]/).pop() ?? '').toLowerCase().replace(/\.exe$/, '');
}

function isGitBinary(word: string): boolean {
	return (
		fileName(word) === 'git' ||
		unescaped(word)
			.toLowerCase()
			.replace(/\.exe$/, '') === 'git'
	);
}

interface Invocation {
	/** `git archive`, which discards only when its output is unpacked over the tree. */
	archive: boolean;
	discards: boolean;
	/** A judged subcommand was among the words that could be the subcommand. */
	judged: boolean;
	/** The subcommand is settled by the text, so appended arguments cannot supply one. */
	settled: boolean;
}

/**
 * Judges one git invocation, given the words after `git`. A global option of unknown arity may
 * or may not swallow the next word, so every word that could be the subcommand is tried.
 */
function readInvocation(words: string[], root: string): Invocation {
	const result: Invocation = { archive: false, discards: false, judged: false, settled: false };
	let mayBeValue = false;
	for (let index = 0; index < words.length; index += 1) {
		const word = words[index];
		if (word === undefined) break;
		const args = words.slice(index + 1);
		// A variable where the subcommand goes could name any of them. The value of `-C` or
		// `-c` is known to be a value, so `git -C "$dir" status` stays usable.
		const knownValue = ['-c', '-C'].includes(words[index - 1] ?? '');
		if (word.includes('$') && !knownValue) result.discards = true;
		if (word === 'archive') result.archive = true;
		if (JUDGED.has(word)) {
			result.judged = true;
			// A variable in a judged command could expand to any flag or pathspec.
			if (args.some((arg) => arg.includes('$')) || isDestructive(word, args, root)) {
				result.discards = true;
			}
		}
		// `--exec=git reset --hard` carries its command after the equals sign.
		const trailing = args.join(' ').split('=').join(' ');
		if (RUNS_A_COMMAND.has(word) && usesDestructiveGit(trailing, root)) result.discards = true;
		if (result.discards) return result;
		if (word.startsWith('-')) {
			mayBeValue = !word.includes('=') && !VALUELESS_GLOBAL_OPTIONS.has(word);
		} else if (mayBeValue) {
			mayBeValue = false;
		} else {
			result.settled = true;
			break;
		}
	}
	return result;
}

/** `xargs` appends its input as arguments and `find -exec` substitutes them for `{}`. */
function argumentsAreFed(words: string[], gitIndex: number): boolean {
	if (words.some((word) => fileName(word) === 'xargs')) return true;
	if (words.some((word) => /^-(?:exec|execdir|ok|okdir)$/.test(word))) return true;
	// A variable before a literal git word may hold `xargs`. A word that is only possibly git
	// does not get this reading, or two variables in one command would always deny.
	if (!isGitBinary(words[gitIndex] ?? '')) return false;
	return words.slice(0, gitIndex).some((word) => word.includes('$') && !isAssignment(word));
}

/** A quoted argument that spells a destructive git command, handed to something that runs it. */
function quotedTextDiscards(segment: string, root: string): boolean {
	const tokens = tokenizeShell(segment);
	if (QUOTES_ARE_TEXT.has(commandWord(tokens.map((token) => unescaped(token.text)))))
		return false;
	return tokens.some((token) => {
		if (!token.unquoted.includes(QUOTED_SPAN) || !/\s|,/.test(token.text)) return false;
		return usesDestructiveGit(token.text.replace(/["'()[\],]/g, ' '), root);
	});
}

function segmentDiscards(segment: string, root: string, unpackedLater: boolean): boolean {
	const words = tokenizeShell(segment).map((token) => unescaped(token.text));
	// `clean.requireForce=false` makes a bare `git clean` delete, with no force flag to see, and
	// once it is set the `git clean` that follows cannot be told from a safe one.
	if (words.some((word) => word.toLowerCase().includes('clean.requireforce'))) return true;
	const inCommandPosition = new Set(commandPositions(words));
	for (let index = 0; index < words.length; index += 1) {
		const word = words[index];
		if (word === undefined) continue;
		// A variable may hold `git`, or the rest of it; what follows is judged as if it did.
		const expands =
			word.startsWith('$') ||
			(word.includes('$') && inCommandPosition.has(index) && !isAssignment(word));
		if (!isGitBinary(word) && !expands) continue;
		const invocation = readInvocation(words.slice(index + 1), root);
		if (invocation.discards || (invocation.archive && unpackedLater)) return true;
		// A judged subcommand, or none yet, can be completed into a destructive one by
		// arguments this check never sees.
		const open = invocation.judged || !invocation.settled;
		if (open && argumentsAreFed(words, index)) return true;
	}
	return false;
}

/** `tar -x`, `tar xf -`, `unzip`: something that writes an archive's files over the tree. */
function unpacks(segment: string): boolean {
	const words = tokenizeShell(segment).map((token) => unescaped(token.text));
	const tool = commandWord(words);
	if (tool === 'unzip' || tool === '7z') return true;
	if (tool !== 'tar' && tool !== 'bsdtar') return false;
	return words.some(
		(word) => /^-?[A-Za-z]*x[A-Za-z]*$/.test(word) || /^--(?:extract|get)$/.test(word),
	);
}

export function usesDestructiveGit(command: string, root: string): boolean {
	// A quote inside a comment or after a backslash is not a real quote, and reading it as one
	// hides the next command. Both readings are checked, and either can deny.
	for (const reading of gitReadings(command)) {
		for (const honourQuotes of [true, false]) {
			const segments = simpleCommands(reading, honourQuotes);
			for (let index = 0; index < segments.length; index += 1) {
				const segment = segments[index] as string;
				const unpackedLater = segments.slice(index + 1).some(unpacks);
				if (segmentDiscards(segment, root, unpackedLater)) return true;
				if (honourQuotes && quotedTextDiscards(segment, root)) return true;
			}
		}
	}
	return false;
}

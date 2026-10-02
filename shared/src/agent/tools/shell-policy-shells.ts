/**
 * Shells and other words that run a string as commands, recognised from the words bash would run.
 *
 * The deny-list for these was three regexes over the raw text. They named a bare shell directly
 * after a pipe or directly before `-c`, so a quoted name, a `.exe` suffix, a wrapper such as
 * `command` or `timeout 5`, a group, another flag before `-c`, or a non-POSIX shell went through,
 * and the text handed over was never inspected by any other check. This reads each simple command
 * as words with quotes and backslashes removed and asks what stands in command position.
 *
 * A shell given a script file (`bash scripts/build.sh`, `pwsh scripts/x.ps1`) is still allowed:
 * that is the documented script-file residual, not something a static check can see into.
 */

import { liftRedirections } from './shell-policy-git-input.ts';
import { tokenizeShell } from './shell-policy-tokens.ts';

const POSIX_SHELLS = new Set(['bash', 'dash', 'ksh', 'sh', 'zsh']);
const POWERSHELLS = new Set(['powershell', 'pwsh']);

/** Words that run the command that follows them, so the next word is still in command position. */
const WRAPPERS = new Set([
	'!',
	'{',
	'builtin',
	'command',
	'do',
	'else',
	'env',
	'exec',
	'ionice',
	'nice',
	'nohup',
	'setsid',
	'stdbuf',
	'then',
	'time',
	'timeout',
	'winpty',
	'xargs',
]);

/** `find` runs the word after each of these as a command. */
const RUNS_NEXT_WORD = new Set(['-exec', '-execdir', '-ok', '-okdir']);

function baseName(word: string): string {
	const name = word.split(/[\\/]/).pop() ?? word;
	return name.toLowerCase().replace(/\.exe$/, '');
}

export function isAssignment(word: string): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);
}

/** Options, assignments, durations and `xargs` placeholders never end command position. */
function isTransparent(word: string): boolean {
	return (
		word.startsWith('-') ||
		isAssignment(word) ||
		/^\d+(?:\.\d+)?[smhd]?$/.test(word) ||
		word === '{}' ||
		WRAPPERS.has(baseName(word))
	);
}

/** Every index whose word bash (or a wrapper it runs) would execute as a command. */
export function commandPositions(words: string[]): number[] {
	const positions: number[] = [];
	let inPosition = true;
	for (let index = 0; index < words.length; index += 1) {
		const word = words[index] as string;
		if (inPosition) positions.push(index);
		if (RUNS_NEXT_WORD.has(word)) inPosition = true;
		else if (!isTransparent(word)) inPosition = false;
	}
	return positions;
}

/** The first word in command position that is not itself a wrapper, option or assignment. */
export function commandWord(words: string[]): string {
	return baseName(words.find((word) => !isTransparent(word)) ?? '');
}

/** Redirections are lifted first: bash removes them, so `< cmds.txt sh` runs `sh`. */
function wordsOf(segment: string): string[] {
	return tokenizeShell(liftRedirections(segment)).map((token) => token.text.split('\\').join(''));
}

/**
 * True when the words after a shell hand it a string to run rather than a script file. Only the
 * words before the script path are the shell's own options; later ones belong to the script.
 */
function carriesCommand(shell: string, args: string[]): boolean {
	const script = args.findIndex((arg) => !arg.startsWith('-') && /[./\\]/.test(arg));
	const own = script === -1 ? args : args.slice(0, script);
	if (POSIX_SHELLS.has(shell)) {
		// `-c`, `-ec`, `-xc`, and `-s` (read commands from standard input).
		return own.some((arg) => /^-[A-Za-z]*[cs][A-Za-z]*$/.test(arg));
	}
	if (POWERSHELLS.has(shell)) {
		// `-Command` and `-EncodedCommand` in every abbreviation, and `-` (standard input).
		return own.some((arg) => arg === '-' || /^-(?:c|co|com\w*|e|ec|en\w*)$/i.test(arg));
	}
	// `cmd /c`, and `cmd //c` as Git Bash has to spell it. Its switches are spelled like paths.
	return args.some((arg) => /^\/{1,2}[ck]$/i.test(arg));
}

function isShell(name: string): boolean {
	return POSIX_SHELLS.has(name) || POWERSHELLS.has(name) || name === 'cmd';
}

function segmentRunsText(segment: string, piped: boolean): boolean {
	const words = wordsOf(segment);
	const readsInput = /(?<!<)<(?![(])/.test(segment.replace(/'[^']*'|"[^"]*"/g, ''));
	for (const index of commandPositions(words)) {
		const name = baseName(words[index] as string);
		const args = words.slice(index + 1);
		if (name === 'eval' || name === 'source' || name === 'trap') return true;
		const splits = (arg: string) => /^-[A-Za-z]*S/.test(arg) || arg.startsWith('--split-s');
		if (name === 'env' && args.some(splits)) return true;
		if (!isShell(name)) continue;
		if (piped || readsInput || carriesCommand(name, args)) return true;
	}
	return false;
}

/**
 * True when some simple command runs text as commands: a shell that receives a pipe or an input
 * redirection, a shell handed a command string, `eval`, `source`, `trap`, or `env -S`.
 */
export function runsTextAsCommands(command: string): boolean {
	for (const honourQuotes of [true, false]) {
		let segment = '';
		let piped = false;
		let quote: '"' | "'" | null = null;
		const chars = Array.from(command);
		for (let index = 0; index <= chars.length; index += 1) {
			const ch = chars[index];
			if (ch !== undefined && quote !== null) {
				if (ch === quote) quote = null;
				segment += ch;
				continue;
			}
			if (ch !== undefined && honourQuotes && (ch === '"' || ch === "'")) {
				quote = ch;
				segment += ch;
				continue;
			}
			if (ch !== undefined && !';|&()\n`'.includes(ch)) {
				segment += ch;
				continue;
			}
			if (segmentRunsText(segment, piped)) return true;
			// A pipe feeds the next simple command, through any group that opens first. `||` is
			// a list operator, and every other separator starts a command with its own input.
			const isPipe = ch === '|' && chars[index + 1] !== '|' && chars[index - 1] !== '|';
			if (isPipe) piped = true;
			else if (ch !== '(' || segment.trim() !== '') piped = false;
			segment = '';
		}
	}
	return false;
}

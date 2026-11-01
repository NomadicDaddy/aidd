/**
 * `cd` or `pushd` with no target, which leaves the workspace for the home directory. Every relative
 * path after it is then read from there while the policy still judges it against the workspace:
 * `cd; cat .aidd/config.json` read the user-level config, with no path knowledge needed.
 *
 * This reads words in command position, as the shell check does, because a regex over the raw text
 * only knew an unquoted `cd` after a short prefix list: `"cd"`, `c\d`, `cd -P`, `if cd`, `! cd` and
 * `A=1 cd` all went through. A name the command itself assigned is read as its value, so `a=cd; $a`
 * is judged too.
 *
 * `cd -` is left to bash: the tool environment carries no OLDPWD, so with no earlier `cd` in the
 * command it fails, and after one it returns to a directory this policy already bounded.
 */

import { simpleCommands } from './shell-policy-git.ts';
import { commandPositions, wordsOf } from './shell-policy-shells.ts';

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;
const REFERENCE = /\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g;

/** `-` is the previous directory, and every other word starting with one is a flag. */
function isOperand(word: string): boolean {
	return word === '-' || !word.startsWith('-');
}

/** `command -v cd` asks where `cd` is and does not run it. */
function onlyLooksUp(words: string[], index: number): boolean {
	const before = words.slice(0, index);
	return before.includes('command') && before.some((word) => /^-[vV]$/.test(word));
}

function noteAssignments(words: string[], bindings: Map<string, string>): void {
	for (const word of words) {
		const assigned = ASSIGNMENT.exec(word);
		if (assigned !== null) bindings.set(assigned[1] as string, assigned[2] as string);
	}
}

function goesHome(words: string[], index: number, bindings: Map<string, string>): boolean {
	const name = (words[index] as string).replace(
		REFERENCE,
		(_reference, variable: string) => bindings.get(variable) ?? '',
	);
	if (name !== 'cd' && name !== 'pushd') return false;
	return !onlyLooksUp(words, index) && !words.slice(index + 1).some(isOperand);
}

export function leavesForHome(command: string): boolean {
	const bindings = new Map<string, string>();
	// A backtick ends a simple command, so without this `cd `x`` reads as a `cd` with no target and
	// loses the "expanded at runtime" denial that names its real problem.
	const substitutionsAsWords = command.replace(/`[^`]*`/g, '$');
	return simpleCommands(substitutionsAsWords, true).some((segment) => {
		const words = wordsOf(segment);
		noteAssignments(words, bindings);
		return commandPositions(words).some((index) => goesHome(words, index, bindings));
	});
}

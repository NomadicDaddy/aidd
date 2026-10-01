/**
 * Commands that print the environment.
 *
 * The tool subprocess runs with a stripped environment, so a dump cannot reach a provider key.
 * It does reach the home directory variables, which the policy otherwise refuses to let a command
 * name. The check used to be one regex on `printenv`, and a redirect, a flag, a second variable
 * name, or any of the other commands that print the environment went through.
 */

import { simpleCommands } from './shell-policy-git.ts';
import { tokenizeShell } from './shell-policy-tokens.ts';

/** Redirections are not arguments: `printenv > out.txt` is still a bare `printenv`. */
const REDIRECTION = /\d*(?:>>?|<)&?\s*[^\s;|&()]*/g;

/** `declare`, `typeset` and `export` print every variable when given only these flags. */
const LISTING_FLAGS = /^-[prx]+$/;

function commandName(word: string): string {
	return (word.split(/[\\/]/).pop() ?? '').toLowerCase().replace(/\.exe$/, '');
}

function isAssignment(word: string): boolean {
	return /^[A-Za-z_]\w*=/.test(word);
}

function segmentDumps(segment: string, homeNames: ReadonlySet<string>): boolean {
	const words = tokenizeShell(segment.replace(REDIRECTION, ' ')).map((token) => token.text);
	let index = 0;
	while (isAssignment(words[index] ?? '')) index += 1;
	const name = commandName(words[index] ?? '');
	const args = words.slice(index + 1);
	const operands = args.filter((arg) => !arg.startsWith('-'));
	switch (name) {
		case 'declare':
		case 'export':
		case 'typeset':
			return args.every((arg) => LISTING_FLAGS.test(arg));
		case 'env': {
			// `env` runs a command when one is named; with only options and assignments it prints.
			const rest = args.filter((arg) => !isAssignment(arg));
			const unset = rest.filter((_, at) => !['--unset', '-u'].includes(rest[at - 1] ?? ''));
			return unset.every((arg) => arg.startsWith('-'));
		}
		case 'printenv':
			return (
				operands.length === 0 || operands.some((arg) => homeNames.has(arg.toUpperCase()))
			);
		case 'set':
			return args.length === 0;
		default:
			return false;
	}
}

export function dumpsEnvironment(command: string, homeVariableNames: string[]): boolean {
	const homeNames = new Set(homeVariableNames.map((name) => name.toUpperCase()));
	for (const honourQuotes of [true, false]) {
		for (const segment of simpleCommands(command, honourQuotes)) {
			if (segmentDumps(segment, homeNames)) return true;
		}
	}
	return false;
}

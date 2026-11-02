import type { ShellToken } from './shell-policy-tokens.ts';

/**
 * Which assignments in a command bash is sure to have made, for the static expansion in
 * `shell-policy-expansion.ts`. A name the expansion takes as set when bash left it empty is a path
 * it never judged: `echo a=x; cat .$a./x` reads `../x`.
 */

/** `NAME=value`, with the name in group 1. */
export const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;
/** A separator after which the next command may not run, or runs in a subshell. */
const UNSURE_SEPARATOR = /[&|()]/;
/** Words of compound commands, inside which an assignment may not run or may run again. */
const COMPOUND_WORDS = new Set([
	'!',
	'{',
	'}',
	'case',
	'do',
	'done',
	'elif',
	'else',
	'esac',
	'fi',
	'for',
	'function',
	'if',
	'select',
	'then',
	'until',
	'while',
]);

/**
 * The indices of the assignments bash is sure to have made by the time later words run: a run of
 * `NAME=value` words that is a whole simple command, at the top level of the command, after `;` or
 * a newline. Anything else may not happen or may not last: an argument (`echo a=x`), a prefix that
 * only sets the next program's environment (`a=x true`), one behind `&&` or `||`, one in a pipeline,
 * a subshell or the background, one inside any compound command, and one in a comment or heredoc.
 * Once a command uses any of those forms, no later assignment counts as sure either.
 */
export function sureAssignments(tokens: ShellToken[], declaresFunction: boolean): Set<number> {
	const sure = new Set<number>();
	// A function body may run later or never, so nothing in it is sure.
	if (declaresFunction) return sure;
	for (let index = 0; index < tokens.length; index += 1) {
		if (makesLaterUnsure(tokens[index] as ShellToken)) break;
		if (!startsAssignmentCommand(tokens, index)) continue;
		const end = assignmentRunEnd(tokens, index);
		if (!endsCommand(tokens[end])) continue;
		for (let cursor = index; cursor < end; cursor += 1) sure.add(cursor);
		index = end - 1;
	}
	return sure;
}

/** A separator or compound word after which no assignment is sure to run or to last. */
function makesLaterUnsure(token: ShellToken): boolean {
	return UNSURE_SEPARATOR.test(token.separators) || COMPOUND_WORDS.has(token.text);
}

/** True when the word at `index` is an assignment that starts a command. */
function startsAssignmentCommand(tokens: ShellToken[], index: number): boolean {
	const token = tokens[index];
	return (index === 0 || token?.separators !== '') && isAssignment(token);
}

/** Where a run of assignments in one simple command ends. */
function assignmentRunEnd(tokens: ShellToken[], start: number): number {
	let end = start + 1;
	while (tokens[end]?.separators === '' && isAssignment(tokens[end])) end += 1;
	return end;
}

/** True when the word after the run starts a new command after `;` or a newline, or there is none. */
function endsCommand(after: ShellToken | undefined): boolean {
	return (
		after === undefined || (after.separators !== '' && !UNSURE_SEPARATOR.test(after.separators))
	);
}

function isAssignment(token: ShellToken | undefined): boolean {
	return token !== undefined && !token.inert && ASSIGNMENT.test(token.text);
}

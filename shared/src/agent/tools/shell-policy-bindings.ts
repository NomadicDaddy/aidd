import type { ShellToken } from './shell-policy-tokens.ts';

/**
 * Which assignments in a command bash is sure to have made, for the static expansion in
 * `shell-policy-expansion.ts`. A name the expansion takes as set when bash left it empty is a path
 * it never judged: `echo a=x; cat .$a./x` reads `../x`.
 */

/** `NAME=value`, with the name in group 1. */
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;
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

/**
 * True when bash is sure to reach the word at `index`: nothing before it is conditional, piped,
 * backgrounded, in a subshell or compound, and the command defines no function.
 */
export function reachedSurely(
	tokens: ShellToken[],
	index: number,
	declaresFunction: boolean,
): boolean {
	if (declaresFunction || UNSURE_SEPARATOR.test(tokens[index]?.separators ?? '')) return false;
	return !tokens.slice(0, index).some(makesLaterUnsure);
}

/** The index of the `done` that closes the loop whose `do` is at `start`, or past the end. */
export function closingDone(tokens: ShellToken[], start: number): number {
	let depth = 0;
	for (let index = start; index < tokens.length; index += 1) {
		if (isReservedWord(tokens, index, 'do')) depth += 1;
		if (!isReservedWord(tokens, index, 'done')) continue;
		depth -= 1;
		if (depth === 0) return index;
	}
	return tokens.length;
}

/** Reserved words after which the next word starts a command too. */
const COMMAND_OPENERS = new Set([
	'!',
	'{',
	'do',
	'elif',
	'else',
	'if',
	'then',
	'time',
	'until',
	'while',
]);
/** A name a `for` or `select` loop can bind. */
const LOOP_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** True when the word at `index` starts a command, where bash reads a reserved word as one. */
function inCommandPosition(tokens: ShellToken[], index: number): boolean {
	for (let at = index; at > 0; at -= 1) {
		if ((tokens[at] as ShellToken).separators !== '') return true;
		const previous = tokens[at - 1] as ShellToken;
		if (previous.inert || !COMMAND_OPENERS.has(previous.unquoted)) return false;
	}
	return true;
}

/**
 * True when the word at `index` is the reserved word `word` as bash reads it: unquoted, unescaped
 * and starting a command. `echo "for" x in a "do"` and `echo for x in a` contain no loop.
 */
export function isReservedWord(tokens: ShellToken[], index: number, word: string): boolean {
	const token = tokens[index];
	if (token === undefined || token.inert || token.unquoted !== word) return false;
	return inCommandPosition(tokens, index);
}

/** The name a `for` or `select` loop starting at `index` binds, or undefined when there is none. */
export function loopName(tokens: ShellToken[], index: number): string | undefined {
	const opensLoop =
		isReservedWord(tokens, index, 'for') || isReservedWord(tokens, index, 'select');
	const name = tokens[index + 1];
	if (!opensLoop || !continuesAs(name, (word) => LOOP_NAME.test(word))) return undefined;
	return continuesAs(tokens[index + 2], (word) => word === 'in') ? name?.unquoted : undefined;
}

/** True when `token` continues the same command and, read unquoted, is what `matches` wants. */
function continuesAs(token: ShellToken | undefined, matches: (word: string) => boolean): boolean {
	return token !== undefined && token.separators === '' && matches(token.unquoted);
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
	return assignedName(token) !== undefined;
}

/** `NAME=` opening a word. Read on the unquoted view, where every quoted span is one marker. */
const UNQUOTED_NAME = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * The name a word assigns, or undefined when bash reads it as an ordinary word. Bash assigns only
 * when the name and the `=` are unquoted and unescaped: `"a"=x`, `a""=x`, `"a=x"` and `a\=x` are
 * commands or arguments, so `a` keeps whatever it held. The value may be quoted (`a="x y"`).
 */
export function assignedName(token: ShellToken | undefined): string | undefined {
	if (token === undefined || token.inert || !UNQUOTED_NAME.test(token.unquoted)) return undefined;
	return ASSIGNMENT.exec(token.text)?.[1];
}

/** Where a loop bash may skip ends: its name, and the values the name held before the loop. */
export type LoopEnd = { before: string[] | undefined; name: string };

/**
 * After a loop bash may have skipped, its name holds either what it held before or a value from
 * the loop. A name the command hadn't set before keeps the environment's value, so it becomes
 * uncertain.
 */
export function settleLoopEnd(
	end: LoopEnd | undefined,
	bindings: Map<string, string[]>,
	uncertain: Set<string>,
): void {
	if (end === undefined) return;
	if (end.before === undefined) {
		uncertain.add(end.name);
		bindings.delete(end.name);
		return;
	}
	bindings.set(end.name, [...new Set([...end.before, ...(bindings.get(end.name) ?? [])])]);
}

/**
 * Records an assignment's values. One bash is sure to make sets the name to them, alongside any
 * value the command set before, since this pass can't tell which one a later word sees. One that
 * may not run or may not last leaves the name as it was: when the command set it before, either
 * value is possible, and when it didn't, the name keeps whatever the environment holds, which the
 * policy can't see. `TMP=src true; ls "$TMP"` lists the inherited TMP, not `src`, so such a name
 * becomes uncertain and any reference to it is denied.
 */
export function recordAssignment(
	name: string,
	assigned: string[],
	isSure: boolean,
	bindings: Map<string, string[]>,
	uncertain: Set<string>,
): void {
	const before = bindings.get(name);
	if (!isSure && (before === undefined || uncertain.has(name))) {
		uncertain.add(name);
		bindings.delete(name);
		return;
	}
	if (isSure) uncertain.delete(name);
	bindings.set(name, [...new Set([...(before ?? []), ...assigned])]);
}

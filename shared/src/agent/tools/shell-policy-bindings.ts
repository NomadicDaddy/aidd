import type { ShellToken } from './shell-policy-tokens.ts';

/**
 * How assignments and loops change a name's possible values, for the static expansion in
 * `shell-policy-expansion.ts`. Which of them bash surely makes in this shell comes from the parsed
 * structure (`shell-policy-structure.ts`). A name the expansion takes as set when bash left it
 * empty is a path it never judged: `echo a=x; cat .$a./x` reads `../x`.
 */

/** `NAME=value`, with the name in group 1. */
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;
/** `NAME=` opening a word. Read on the unquoted view, where every quoted span is one marker. */
const UNQUOTED_NAME = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * The name a word assigns, or undefined when bash reads it as an ordinary word. Bash assigns only
 * when the name and the `=` are unquoted and unescaped: `"a"=x`, `a""=x`, `"a=x"` and `a\=x` are
 * commands or arguments, so `a` keeps whatever it held. The value may be quoted (`a="x y"`).
 *
 * Every such word counts, wherever it sits, because some commands make an argument an assignment
 * (`export a=x`); only the ones the structure marks as sure replace what the name held.
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

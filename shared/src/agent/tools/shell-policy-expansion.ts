import type { ShellLoop, ShellStructure } from './shell-policy-structure.ts';

import {
	assignedName,
	type LoopEnd,
	recordAssignment,
	settleLoopEnd,
} from './shell-policy-bindings.ts';
import {
	DOT_GLOB,
	DOT_GLOB_DENIAL,
	rejectRuntimeRewrites,
	unbounded,
} from './shell-policy-rewrites.ts';
import { restoreProtectedDollars, type ShellToken } from './shell-policy-tokens.ts';

/**
 * Static expansion for the bash workspace policy.
 *
 * Containment used to be judged on the literal spelling of each argument, and bash expands the
 * spelling before it runs: `cat "$PWD/../outside.txt"` resolved as the harmless relative segment
 * `$PWD/...`, `$TEMP/outside.txt` and `$SystemRoot/System32/drivers/etc/hosts` named directories
 * the sanitized tool environment really does supply, `a=.; cat $a$a` spelled `..` out of two dots,
 * `..{,}` brace-expanded to the parent, and `$'\x2e\x2e'` decoded to it. None of those paths were
 * visible to a lexical check because none of them existed until runtime.
 *
 * This pass expands what can be expanded statically and refuses what cannot. A variable is known
 * only when the command itself binds it (`NAME=value`, `for NAME in ...`); every reference is
 * replaced by the bound literal, so the containment sweep judges the value bash will actually use.
 * An assignment bash may skip or not keep (an argument, an environment prefix, one behind `&&`, in
 * a subshell or a compound command) leaves the name as it was. When the command set it before,
 * either value is judged; when it didn't, the name still holds whatever the environment gave it,
 * so it is denied like any other unknown: `TMP=src true; ls "$TMP"` lists the inherited TMP, and
 * `echo a=x; cat .$a./x` is `../x` to bash. `unset` is denied outright. A reference to anything
 * else — the environment, positional parameters, a `read`-bound name — has a value the policy
 * cannot see, so the command is denied and the denial says which variable to spell out. The
 * remaining runtime rewrites (brace expansion, `${...}` operations, `$'...'`, dot-globs) are denied
 * outright: none of them is needed to work inside a project.
 */

const NAME = '[A-Za-z_][A-Za-z0-9_]*';
const REFERENCE = new RegExp(`\\$(?:\\{(${NAME})\\}|(${NAME}))`, 'g');
/** `$?`, `$$`, `$!`, `$#`: always digits, never a path. */
const NUMERIC_SPECIAL = /\$[?$!#]/g;
/** Bash-maintained variables that can only ever expand to digits. */
const NUMERIC_NAMES = new Set([
	'BASHPID',
	'EPOCHREALTIME',
	'EPOCHSECONDS',
	'EUID',
	'LINENO',
	'PPID',
	'RANDOM',
	'SECONDS',
	'SHLVL',
	'UID',
]);
const MAX_VARIANTS = 64;

export type ExpansionResult = { error: string } | { tokens: string[] };

/**
 * Expand `$NAME`/`${NAME}` in one token from the known bindings. Returns the name of the first
 * unknown variable, or null when the combinations outgrow {@link MAX_VARIANTS}.
 */
function expandReferences(
	token: string,
	bindings: Map<string, string[]>,
	uncertain: Set<string>,
): null | string | string[] {
	let variants = [''];
	let cursor = 0;
	for (const match of token.matchAll(REFERENCE)) {
		const name = match[1] ?? match[2] ?? '';
		if (uncertain.has(name)) return name;
		// The command's own value first: `SHLVL=.` makes `$SHLVL` a dot, whatever bash keeps there.
		const values = bindings.get(name) ?? (NUMERIC_NAMES.has(name) ? ['0'] : undefined);
		if (values === undefined) return name;
		const start = match.index ?? 0;
		const literal = token.slice(cursor, start);
		const next: string[] = [];
		for (const variant of variants) {
			for (const value of values) next.push(variant + literal + value);
		}
		if (next.length > MAX_VARIANTS) return null;
		variants = next;
		cursor = start + match[0].length;
	}
	const tail = token.slice(cursor);
	return variants.map((variant) => variant + tail);
}

function noteBodyReads(text: string, readInBody: Set<string>): void {
	for (const match of text.matchAll(REFERENCE)) readInBody.add(match[1] ?? match[2] ?? '');
}

/** What a token's expansion means: the values to judge, or why it can't be judged. */
function judgeExpansion(
	text: string,
	result: null | string | string[],
): { error: string } | string[] {
	if (result === null) {
		return { error: 'ERROR: bash command expands to too many variants to check' };
	}
	if (typeof result === 'string') {
		return {
			error: `ERROR: bash command expands $${result}, which the command does not set for certain; its value is unknown and cannot be bounded to the workspace (assign it in the command, or spell the path out)`,
		};
	}
	if (result.some((value) => value !== text && DOT_GLOB.test(value))) {
		return { error: DOT_GLOB_DENIAL };
	}
	return result;
}

/**
 * The words bash will run, with every reference the command itself bound replaced by its value.
 *
 * Bindings are followed in command order: `a=.; b=$a; cat $b/x` yields `cat ./x`, and a `for`
 * list binds its name to every item, so `for f in src test; do rg x $f; done` checks both. A
 * token that expands to several values contributes each of them. `$?`-style specials and bash's
 * numeric variables (`$RANDOM`, `$SECONDS`) are digits and expand to `0`; `$PWD` is the
 * workspace, so it expands to `.` and `$PWD/../x` is judged as `./../x`.
 *
 * This is one pass over text that bash may run differently, so a later assignment adds to a name's
 * values rather than replacing them: `b=.; true || b=z` leaves both possible. And a body that runs
 * again or later reads the value at that moment, so assigning a name once such a body has read it
 * is denied. Which assignments and loops bash surely runs in this shell comes from the command's
 * parsed `structure`; a command the parser couldn't read arrives as the construct that stopped it.
 */
export function expandShellTokens(
	tokens: ShellToken[],
	structure: ShellStructure | string,
): ExpansionResult {
	const rejected = rejectRuntimeRewrites(tokens);
	if (rejected !== null) return { error: rejected };
	if (typeof structure === 'string') {
		return {
			error: `ERROR: bash command has ${structure}, which the policy cannot read as bash would, so what it would run cannot be judged`,
		};
	}
	const state: Expansion = {
		bindings: new Map([['PWD', ['.']]]),
		expanded: [],
		inBody: false,
		loopEnds: new Map(),
		readInBody: new Set(),
		uncertain: new Set(),
	};
	for (const [index, token] of tokens.entries()) {
		settleLoopEnd(state.loopEnds.get(index), state.bindings, state.uncertain);
		if (index >= structure.bodyStart) state.inBody = true;
		const loop = structure.loops.get(index);
		const error =
			loop?.name === undefined
				? expandWord(state, token, index, structure)
				: bindLoop(state, tokens, loop, loop.name);
		if (error !== null) return error;
	}
	return { tokens: state.expanded };
}

type Expansion = {
	bindings: Map<string, string[]>;
	expanded: string[];
	inBody: boolean;
	/** Where a loop bash may skip, or runs in a subshell, ends, and the name's values before it. */
	loopEnds: Map<number, LoopEnd>;
	readInBody: Set<string>;
	/** Names an assignment may or may not have set, over a value the policy can't see. */
	uncertain: Set<string>;
};

type Failure = { error: string } | null;

function rebound(state: Expansion, name: string): Failure {
	return state.readInBody.has(name)
		? { error: unbounded(`assigns $${name} after a loop or function body reads it`) }
		: null;
}

/** The name now holds a value the policy can't see, so any reference to it is denied. */
function forget(state: Expansion, name: string): void {
	state.uncertain.add(name);
	state.bindings.delete(name);
}

function expandText(state: Expansion, text: string): { error: string } | string[] {
	if (state.inBody) noteBodyReads(text, state.readInBody);
	const references = expandReferences(
		text.replace(NUMERIC_SPECIAL, '0'),
		state.bindings,
		state.uncertain,
	);
	const values = judgeExpansion(text, references);
	if (!Array.isArray(values)) return values;
	for (const value of values) state.expanded.push(restoreProtectedDollars(value));
	return values;
}

function expandWord(
	state: Expansion,
	token: ShellToken,
	index: number,
	structure: ShellStructure,
): Failure {
	const values = expandText(state, token.text);
	if (!Array.isArray(values)) return values;
	const name = assignedName(token);
	if (name === undefined) return null;
	const failure = rebound(state, name);
	if (failure !== null) return failure;
	if (structure.arrays.has(index)) {
		forget(state, name);
		return null;
	}
	const assigned = values.map((value) => value.slice(name.length + 1));
	recordAssignment(name, assigned, structure.sure.has(index), state.bindings, state.uncertain);
	return null;
}

/**
 * Only a loop bash reads as one binds its name: `echo "for" x in a "do"` binds nothing. With no `in`
 * list it walks the positional parameters, which the policy can't see.
 */
function bindLoop(state: Expansion, tokens: ShellToken[], loop: ShellLoop, name: string): Failure {
	const failure = rebound(state, name);
	if (failure !== null) return failure;
	if (loop.items === undefined) {
		forget(state, name);
		return null;
	}
	const values = loopValues(state, tokens, loop.items);
	if (!Array.isArray(values)) return values;
	// An empty list runs no iteration and leaves the name as it was.
	if (values.length === 0) return null;
	// A loop bash may skip, or one run in a subshell, leaves the name as it was or holding an item.
	if (!loop.lasting) {
		state.loopEnds.set(loop.end, { before: state.bindings.get(name), name });
	}
	state.uncertain.delete(name);
	state.bindings.set(name, values);
	return null;
}

/** Every value a loop's items expand to; a word quotes made empty is the empty value. */
function loopValues(
	state: Expansion,
	tokens: ShellToken[],
	items: (number | undefined)[],
): { error: string } | string[] {
	const values: string[] = [];
	for (const item of items) {
		const text = item === undefined ? '' : (tokens[item]?.text ?? '');
		const itemValues = expandText(state, text);
		if (!Array.isArray(itemValues)) return itemValues;
		values.push(...itemValues);
	}
	return values;
}

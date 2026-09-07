import { QUOTED_SPAN, restoreProtectedDollars, type ShellToken } from './shell-policy-tokens.ts';

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
 * A reference to anything else — the environment, positional parameters, a `read`-bound name —
 * has a value the policy cannot see, so the command is denied and the denial says which variable
 * to spell out. The remaining runtime rewrites (brace expansion, `${...}` operations, `$'...'`,
 * dot-globs) are denied outright: none of them is needed to work inside a project.
 */

const NAME = '[A-Za-z_][A-Za-z0-9_]*';
const REFERENCE = new RegExp(`\\$(?:\\{(${NAME})\\}|(${NAME}))`, 'g');
const PARAMETER_OPERATION = new RegExp(`\\$\\{(?!${NAME}\\})`);
const ASSIGNMENT = new RegExp(`^(${NAME})=(.*)$`, 's');
const NAME_ONLY = new RegExp(`^${NAME}$`);
/** `$0`, `$1`, `$@`, `$*`, `$-`: set by the invocation, not by the command. */
const POSITIONAL_OR_SPECIAL = /\$[0-9@*-]/;
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
/** Builtins that bind a name to data produced at runtime (or alias it to another variable). */
const BINDING_BUILTINS = new Set([
	'declare',
	'getopts',
	'let',
	'local',
	'mapfile',
	'read',
	'readarray',
	'typeset',
]);
const BRACE_EXPANSION = /\{[^{}]*(?:,|\.\.)[^{}]*\}/;
/** `.*`, `.?`, `.[..]` as a path segment: bash without `globskipdots` matches `..` with these. */
const DOT_GLOB = /(?:^|\/)\.[*?[]/;
const MAX_VARIANTS = 64;

export type ExpansionResult = { error: string } | { tokens: string[] };

function unbounded(construct: string): string {
	return `ERROR: bash command ${construct}; its value is produced at runtime and cannot be bounded to the workspace`;
}

/**
 * Expand `$NAME`/`${NAME}` in one token from the known bindings. Returns the name of the first
 * unknown variable, or null when the combinations outgrow {@link MAX_VARIANTS}.
 */
function expandReferences(
	token: string,
	bindings: Map<string, string[]>,
): null | string | string[] {
	let variants = [''];
	let cursor = 0;
	for (const match of token.matchAll(REFERENCE)) {
		const name = match[1] ?? match[2] ?? '';
		const values = NUMERIC_NAMES.has(name) ? ['0'] : bindings.get(name);
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

function rejectRuntimeRewrites(tokens: ShellToken[]): null | string {
	for (const [index, token] of tokens.entries()) {
		if (token.unquoted.includes(`$${QUOTED_SPAN}`)) {
			return unbounded(`uses $'...' quoting`);
		}
		if (PARAMETER_OPERATION.test(token.text)) {
			return unbounded('uses a ${...} parameter operation');
		}
		if (POSITIONAL_OR_SPECIAL.test(token.text)) {
			return unbounded('expands a positional or special parameter ($0, $1, $@)');
		}
		if (BRACE_EXPANSION.test(token.unquoted)) {
			return unbounded('uses brace expansion ({a,b} or {x..y})');
		}
		if (DOT_GLOB.test(token.unquoted)) {
			return 'ERROR: bash command uses a dot-glob (.*, .?), which can match the parent directory and escape the workspace';
		}
		const next = tokens[index + 1]?.unquoted ?? '';
		if (
			BINDING_BUILTINS.has(token.unquoted) ||
			(token.unquoted === 'printf' && /^-[a-zA-Z]*v/.test(next))
		) {
			return unbounded(`binds a variable with '${token.unquoted}'`);
		}
	}
	return null;
}

/**
 * The words bash will run, with every reference the command itself bound replaced by its value.
 *
 * Bindings are followed in command order: `a=.; b=$a; cat $b/x` yields `cat ./x`, and a `for`
 * list binds its name to every item, so `for f in src test; do rg x $f; done` checks both. A
 * token that expands to several values contributes each of them. `$?`-style specials and bash's
 * numeric variables (`$RANDOM`, `$SECONDS`) are digits and expand to `0`; `$PWD` is the
 * workspace, so it expands to `.` and `$PWD/../x` is judged as `./../x`.
 */
export function expandShellTokens(tokens: ShellToken[]): ExpansionResult {
	const rejected = rejectRuntimeRewrites(tokens);
	if (rejected !== null) return { error: rejected };

	const bindings = new Map<string, string[]>([['PWD', ['.']]]);
	const expanded: string[] = [];
	const expand = (text: string): { error: string } | string[] => {
		const result = expandReferences(text.replace(NUMERIC_SPECIAL, '0'), bindings);
		if (result === null) {
			return { error: 'ERROR: bash command expands to too many variants to check' };
		}
		if (typeof result === 'string') {
			return {
				error: `ERROR: bash command expands $${result}, which the command does not set; its value is unknown and cannot be bounded to the workspace (assign it in the command, or spell the path out)`,
			};
		}
		return result;
	};

	for (const [index, token] of tokens.entries()) {
		const text = token.text;
		const loopName = tokens[index + 1]?.text ?? '';
		if (
			(text === 'for' || text === 'select') &&
			NAME_ONLY.test(loopName) &&
			tokens[index + 2]?.text === 'in'
		) {
			const values: string[] = [];
			for (let cursor = index + 3; cursor < tokens.length; cursor += 1) {
				const item = tokens[cursor]?.text ?? '';
				if (item === 'do') break;
				const itemValues = expand(item);
				if (!Array.isArray(itemValues)) return itemValues;
				values.push(...itemValues);
				for (const value of itemValues) expanded.push(restoreProtectedDollars(value));
			}
			bindings.set(loopName, values.length > 0 ? values : ['']);
			continue;
		}

		const values = expand(text);
		if (!Array.isArray(values)) return values;
		for (const value of values) expanded.push(restoreProtectedDollars(value));

		const name = ASSIGNMENT.exec(text)?.[1];
		if (name !== undefined) {
			bindings.set(
				name,
				values.map((value) => value.slice(name.length + 1)),
			);
		}
	}
	return { tokens: expanded };
}

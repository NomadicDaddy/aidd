import { QUOTED_SPAN, restoreProtectedDollars, type ShellToken } from './shell-policy-tokens.ts';

/**
 * The runtime rewrites the static expansion in `shell-policy-expansion.ts` refuses outright: brace
 * expansion, `${...}` operations, `$'...'`, dot-globs, positional parameters, `+=`, IFS, globbing
 * switches and the builtins that bind a name at runtime. None of them is needed to work inside a
 * project, and each makes the values the expansion would judge differ from the ones bash uses.
 */

const NAME = '[A-Za-z_][A-Za-z0-9_]*';
const PARAMETER_OPERATION = new RegExp(`\\$\\{(?!${NAME}\\})`);
const APPEND_ASSIGNMENT = new RegExp(`^${NAME}\\+=`);
/** `$0`, `$1`, `$@`, `$*`, `$-`: set by the invocation, not by the command. */
const POSITIONAL_OR_SPECIAL = /\$[0-9@*-]/;
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
/**
 * `.*`, `.?`, `.[..]`, `..*` as a path segment: bash without `globskipdots` matches `..` with
 * these.
 */
export const DOT_GLOB = /(?:^|\/)\.\.?[*?[]/;
export const DOT_GLOB_DENIAL =
	'ERROR: bash command uses a dot-glob (.*, .?), which can match the parent directory and escape the workspace';

export function unbounded(construct: string): string {
	return `ERROR: bash command ${construct}; its value is produced at runtime and cannot be bounded to the workspace`;
}

/**
 * What changes how bash splits or globs a value, so the values judged here would not be the ones
 * it uses. Read with quotes removed, because `"shopt"` runs just the same.
 */
function rejectWordRules(tokens: ShellToken[], index: number): null | string {
	const text = decodedWord(tokens[index]);
	if (APPEND_ASSIGNMENT.test(text)) return unbounded('appends to a variable with +=');
	if (text.startsWith('IFS=')) return unbounded('assigns IFS, which changes how values split');
	if (text === 'shopt') return unbounded("changes shell options with 'shopt'");
	const [option, value] = [decodedWord(tokens[index + 1]), decodedWord(tokens[index + 2])];
	if (text === 'set' && togglesGlobbing(option, value)) {
		return unbounded("changes globbing with 'set'");
	}
	return null;
}

function togglesGlobbing(option: string, value: string): boolean {
	return /^[-+][a-zA-Z]*f/.test(option) || (/^[-+]o$/.test(option) && value === 'noglob');
}

function decodedWord(token: ShellToken | undefined): string {
	return restoreProtectedDollars(token?.text ?? '')
		.split('\\')
		.join('');
}

/** The first runtime rewrite in the command, as its denial, or null when it uses none. */
export function rejectRuntimeRewrites(tokens: ShellToken[]): null | string {
	for (const [index, token] of tokens.entries()) {
		const wordRule = rejectWordRules(tokens, index);
		if (wordRule !== null) return wordRule;
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
			return DOT_GLOB_DENIAL;
		}
		// Read as bash runs it: `"read"` and `r\ead` are `read` too.
		const name = decodedWord(token);
		const next = decodedWord(tokens[index + 1]);
		if (BINDING_BUILTINS.has(name) || (name === 'printf' && /^-[a-zA-Z]*v/.test(next))) {
			return unbounded(`binds a variable with '${name}'`);
		}
		if (name === 'unset') return unbounded("unsets a variable with 'unset'");
	}
	return null;
}

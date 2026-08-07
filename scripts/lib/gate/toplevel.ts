/**
 * Line-level brace-depth scanner, used by rule GC1 to decide which statements run at import time.
 *
 * This is a lexer, not a parser, and it exists because the alternative -- pulling in a TypeScript
 * AST just to answer "does this line sit at module scope" -- would make the meta-gate heavier than
 * every gate it checks. It masks the four constructs that otherwise corrupt brace counting: line
 * comments, block comments, string and template literals, and regex literals.
 *
 * Regex literals are not optional to handle. `scripts/check-artifact-parity.ts` in aidd carries a
 * backtick inside a character class, which without regex awareness opens a template literal that
 * never closes and silently masks the rest of the file.
 */

export interface LineContext {
	/** Brace depth at the start of the line. 0 means module scope. */
	depth: number;
	/** True when the line begins inside a block comment or template literal. */
	suppressed: boolean;
}

/**
 * Characters after which a `/` begins a regex literal rather than a division.
 *
 * Grammatically these are the operator, separator and open-bracket positions, plus start-of-input.
 * The list is sorted rather than grouped by role because `perfectionist/sort-sets` requires it.
 */
const REGEX_PRECEDERS = new Set([
	'',
	'\n',
	'-',
	',',
	';',
	':',
	'!',
	'?',
	'(',
	'[',
	'{',
	'}',
	'*',
	'&',
	'%',
	'^',
	'+',
	'<',
	'=',
	'>',
	'|',
	'~',
]);

/** Advance past a quoted string that starts at `i`. Returns the index after the closing quote. */
function skipString(line: string, i: number, quote: string): number {
	let j = i + 1;
	while (j < line.length) {
		if (line[j] === '\\') {
			j += 2;
			continue;
		}
		if (line[j] === quote) return j + 1;
		j++;
	}
	return j;
}

/** Advance past a regex literal that starts at `i`. Returns the index after the closing slash. */
function skipRegex(line: string, i: number): number {
	let j = i + 1;
	let inClass = false;
	while (j < line.length) {
		const c = line[j]!;
		if (c === '\\') {
			j += 2;
			continue;
		}
		if (c === '[') inClass = true;
		else if (c === ']') inClass = false;
		else if (c === '/' && !inClass) return j + 1;
		j++;
	}
	return j;
}

/**
 * Depth and suppression state at the start of every line. Returns one entry per line of `source`.
 */
export function scanLines(source: string): LineContext[] {
	const lines = source.split('\n');
	const contexts: LineContext[] = [];
	let depth = 0;
	let inBlockComment = false;
	let inTemplate = false;
	let lastSignificant = '';

	for (const line of lines) {
		contexts.push({ depth, suppressed: inBlockComment || inTemplate });
		let i = 0;
		while (i < line.length) {
			const c = line[i]!;
			const next = line[i + 1];

			if (inBlockComment) {
				if (c === '*' && next === '/') {
					inBlockComment = false;
					i += 2;
					continue;
				}
				i++;
				continue;
			}
			if (inTemplate) {
				if (c === '\\') {
					i += 2;
					continue;
				}
				if (c === '`') {
					inTemplate = false;
					lastSignificant = '`';
					i++;
					continue;
				}
				i++;
				continue;
			}
			if (c === '/' && next === '/') break;
			if (c === '/' && next === '*') {
				inBlockComment = true;
				i += 2;
				continue;
			}
			if (c === '`') {
				inTemplate = true;
				i++;
				continue;
			}
			if (c === "'" || c === '"') {
				i = skipString(line, i, c);
				lastSignificant = c;
				continue;
			}
			if (c === '/' && REGEX_PRECEDERS.has(lastSignificant)) {
				i = skipRegex(line, i);
				lastSignificant = '/';
				continue;
			}
			if (c === '{') depth++;
			else if (c === '}') depth--;
			if (c.trim() !== '') lastSignificant = c;
			i++;
		}
		// A statement that ended on this line does not carry its last character into the next one;
		// a line break is a valid regex preceder, so reset rather than leak the previous char.
		if (lastSignificant === '') lastSignificant = '\n';
	}

	return contexts;
}

/** Statement openers legal at module scope: declarations, imports, exports, and type positions. */
const DECLARATION =
	/^(?:#!|import\b|export\b|const\b|let\b|var\b|function\b|async\s+function\b|class\b|interface\b|type\b|enum\b|declare\b|abstract\b)/;

/** The single sanctioned imperative statement at module scope. */
const MAIN_GUARD = /^if\s*\(\s*import\.meta\.main\s*\)/;

/** Continuation and comment lines that begin at column 0 but open nothing. */
const NON_STATEMENT = /^(?:\/\/|\/\*|\*|[)}\]`,;])/;

/** A declaration whose initializer awaits: a side effect wearing a declaration's clothes. */
const TOP_LEVEL_AWAIT = /^(?:export\s+)?(?:const|let|var)\b[^=]*=\s*await\b/;

export interface TopLevelScan {
	/** True when the module carries an `if (import.meta.main)` guard. */
	hasGuard: boolean;
	/** 1-indexed lines carrying an imperative statement at module scope. */
	sideEffects: { line: number; text: string }[];
}

/**
 * Classify every module-scope statement in `source`.
 *
 * Scope limit, stated because a checker that overclaims is worse than one that underclaims: this
 * proves no imperative STATEMENT runs at import time. It does not prove no work runs at import
 * time. `const findings = runEverything()` is a declaration and passes. The guard's presence and
 * the absence of loose statements are what make a module importable by its own test; proving the
 * initializers are cheap is a review question, not a static one.
 */
export function scanTopLevel(source: string): TopLevelScan {
	const lines = source.split('\n');
	const contexts = scanLines(source);
	const sideEffects: { line: number; text: string }[] = [];
	let hasGuard = false;

	lines.forEach((line, index) => {
		const context = contexts[index]!;
		if (context.depth !== 0 || context.suppressed) return;
		if (line.length === 0 || /^\s/.test(line)) return;
		if (NON_STATEMENT.test(line)) return;
		if (MAIN_GUARD.test(line)) {
			hasGuard = true;
			return;
		}
		if (DECLARATION.test(line)) {
			if (TOP_LEVEL_AWAIT.test(line)) {
				sideEffects.push({ line: index + 1, text: line.trim() });
			}
			return;
		}
		sideEffects.push({ line: index + 1, text: line.trim() });
	});

	return { hasGuard, sideEffects };
}

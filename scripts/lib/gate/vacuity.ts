/**
 * GC5's decidable half: does a gate that passed say how many items it examined?
 *
 * Rule 5 of `docs/reference/gate-conventions.md` has two halves, and only one of them is a property
 * of the source text.
 *
 * "A gate that examined zero items fails" describes a code path. Whether a given run reached zero
 * is not answerable from the text, so that half stays a review item, which is what the conventions
 * document said about the whole rule until this file existed.
 *
 * "A gate that passed states how many items it examined" is decidable: a success line either
 * interpolates a count or it does not. Six vacuous passes were found by hand, one gate at a time,
 * before anyone asked whether the class had a static form. Not one of the six printed a number, so
 * every one of them would have been caught here, at the line that reported the pass.
 */

/**
 * Source with comment bodies blanked, preserving line and column positions.
 *
 * Several gates discuss `[OK]` in their own docblocks. `check-git-window-hide.ts` explains why an
 * `[OK]` there would be a pass earned by looking at nothing, and `check-audit-artifact-hygiene.ts`
 * spends three lines on when to print `[SKIP]` instead. A prose mention is not an output line, and
 * scanning raw text would read those as success lines and clear the gate on the strength of a
 * comment about the very rule being checked.
 */
export function blankComments(source: string): string {
	const blank = (match: string): string => match.replace(/[^\n]/g, ' ');
	return source
		.replace(/\/\*[\s\S]*?\*\//g, blank)
		.replace(
			/(^|[^:])(\/\/.*)$/gm,
			(_m, before: string, comment: string) => before + blank(comment),
		);
}

/**
 * Discovery, in two forms, because it is not always in the entry file.
 *
 * `check-application.ts` reads no directory itself; it imports `findDbFiles` and `findRogueFolders`
 * from its library. Matching only the filesystem primitives would classify it as a fixed-population
 * gate and exempt the one shape this rule exists to catch, so a `find*`/`collect*`-shaped call
 * counts as discovery too.
 */
const DISCOVERY =
	/readdirSync|readdir\(|Bun\.Glob|new Glob|globSync|\bglob\(|\b(?:find|collect|discover|walk|scan|gather|enumerate)[A-Z]\w*\s*\(/;

/**
 * Identifiers that name a quantity.
 *
 * `check-max-lines.ts` is why this is a vocabulary and not "does the line interpolate anything".
 * Its success line reads `no file exceeds ${MAX_LINES} lines` -- an interpolated number that is a
 * threshold, not a count of the files it walked. It is a real finding, and a looser test would
 * clear it.
 */
const COUNT_WORDS = [
	'checked',
	'compared',
	'count',
	'entries',
	'examined',
	'files',
	'matched',
	'packages',
	'rows',
	'scanned',
	'sites',
	'total',
];

const capitalize = (word: string): string => word[0]!.toUpperCase() + word.slice(1);

/**
 * A count expression, in three shapes: a collection's size, a bare or snake_case count word, or a
 * camelCase one.
 *
 * The leading `[^A-Za-z0-9_]` on the bare form is load-bearing: without it `account` and `discount`
 * both read as counts. The camelCase form is what makes `rowCount` and `ruleCount` resolve, which
 * `check-artifact-parity.ts` states its two counts with.
 */
const COUNT_EXPRESSION = new RegExp(
	'\\.length\\b|\\.size\\b|\\.filter\\(|' +
		`(?:^|[^A-Za-z0-9_])(?:${COUNT_WORDS.join('|')})(?![A-Za-z0-9_])|` +
		`[a-z0-9_](?:${COUNT_WORDS.map(capitalize).join('|')})(?![A-Za-z0-9_])`,
);

/**
 * Every string literal in the source, in order.
 *
 * One alternation scanned left to right, rather than three independent searches, because the quote
 * characters have to be consumed in the order they appear or the pairing drifts. Searching for
 * `'...[OK]...'` on its own matched from an apostrophe in one argument, across two lines of real
 * code, to an apostrophe in the next -- swallowing `check-critical-path.ts`'s genuine backtick
 * success line and reporting the wrong line number for it. Quoted forms therefore stop at a
 * newline, which JavaScript requires of them anyway; only the template form may span lines.
 */
const STRING_LITERAL = /`(?:\\[\s\S]|[^\\`])*`|'(?:\\[\s\S]|[^\\'\n])*'|"(?:\\[\s\S]|[^\\"\n])*"/g;

/**
 * String and template literals carrying an `[OK]` marker, with their offsets.
 *
 * Literals joined by `+` are one line, not several. The 100-column limit splits most success lines
 * across two fragments, and the count usually lands in the second one: `check-feature-integration`
 * opens with `[OK] Feature integration check passed (${frontend.pages} page(s) registered, ` and
 * closes with `${skeleton.scanned} component file(s) scanned).` on the next. Reading the fragments
 * separately would report every wrapped success line as countless.
 */
function successLiterals(source: string): { index: number; text: string }[] {
	const merged: { index: number; text: string }[] = [];
	let end = -1;

	for (const match of source.matchAll(STRING_LITERAL)) {
		const previous = merged.at(-1);
		if (previous && /^\s*\+\s*$/.test(source.slice(end, match.index))) {
			previous.text += match[0];
		} else {
			merged.push({ index: match.index, text: match[0] });
		}
		end = match.index + match[0].length;
	}

	return merged.filter((literal) => literal.text.includes('[OK]'));
}

/** Does this literal interpolate something that names a quantity? */
function statesCount(literal: string): boolean {
	return [...literal.matchAll(/\$\{([^}]*)\}/g)].some((match) =>
		COUNT_EXPRESSION.test(match[1]!),
	);
}

export interface VacuityResult {
	/** 1-indexed line of the first success line, when no success line states a count. */
	countlessLine: null | number;
	/** Whether the gate's population is discovered at run time rather than fixed in source. */
	discovers: boolean;
}

/**
 * Inspect a gate's source for rule 5's count half.
 *
 * A gate with no success literal at all is not this rule's business -- that is GC3's missing status
 * marker -- and reports `countlessLine: null` so it is not double-flagged.
 */
export function inspectVacuity(source: string): VacuityResult {
	const code = blankComments(source);
	const literals = successLiterals(code);
	const discovers = DISCOVERY.test(code);

	if (literals.length === 0 || literals.some((literal) => statesCount(literal.text))) {
		return { countlessLine: null, discovers };
	}
	return {
		countlessLine: code.slice(0, literals[0]!.index).split('\n').length,
		discovers,
	};
}

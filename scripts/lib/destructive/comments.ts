/**
 * A code-only view of a source file, for the gate that reads confirmation evidence out of one.
 *
 * `check-destructive-confirmation` matched its patterns against raw lines, so prose counted as
 * code. Four separate faults came out of that, and the ordering matters: the first is silent.
 *
 * - `// TODO: wrap this in a ConfirmAlertDialog before shipping` sits within the evidence window of
 *   the very call it says is unguarded, and the gate reports the site confirmed. A comment noting
 *   the confirmation is missing became the evidence that it is present.
 * - A waiver whose reason names a primitive is read as evidence, so the call resolves without the
 *   marker, the marker is never marked used, and the gate reports it stale: "this marker no longer
 *   suppresses anything". Both waivers in aidd describe themselves by what they are not -- "not a
 *   dialog", "matches none of the confirmation primitives" -- and pass today only because neither
 *   happened to spell one of the five names.
 * - `// deleteThing.mutate(id)` is counted as a live destructive site and demands a waiver for code
 *   that does not run.
 * - The same-line marker form documented in `waivers.ts` never worked, because the caller skipped
 *   any line carrying a marker before `coveringMarker` could claim it. Blanking comments removes
 *   the reason that skip existed: the marker's own text can no longer match a destructive pattern,
 *   so the line stays a site and the marker on it is found and honoured.
 *
 * String contents are dropped for the same reason, and it is the same fault one layer over: a
 * primitive named in a toast message, in a route path, or in a test's expected text is prose that
 * happens to sit inside quotes rather than inside a comment, and the evidence scan cannot tell the
 * two apart. `'Deleting this is permanent -- confirm in the ConfirmAlertDialog'` sitting in the
 * evidence window of an unguarded call passes it, exactly as the comment form did. The delimiters
 * stay so the surrounding line still reads as code; only what sits between them goes.
 *
 * Line count and indentation are preserved, because both callers index into the result alongside
 * the raw lines and `enclosingFunction` measures depth from what it is given.
 *
 * Where the scan cannot be exact it removes too much rather than too little, and the asymmetry is
 * deliberate. This is not a parser: a `//` inside JSX text, or the trailing delimiter of a regex
 * literal, truncates the rest of its line, and an unbalanced backtick blanks the rest of the file.
 * Dropping real evidence produces a finding on a call that has confirmation, which a reader sees
 * and can waive. Keeping prose produces a pass on a call that has none, which nobody sees at all.
 */

/** Quote characters that open a string whose contents the scan drops. */
const QUOTES = new Set(["'", '"', '`']);

/**
 * `lines` with every comment and the contents of every string blanked, one output line per input
 * line. Quote delimiters are kept; the prose between them is not.
 *
 * Block comments and template literals both carry across lines, which is why this takes the whole
 * file rather than working a line at a time: a `/*` or a backtick opened three lines above is still
 * open here, and a line-at-a-time scan reads what is inside it as code.
 */
export function codeOnly(lines: string[]): string[] {
	const stripped: string[] = [];
	let inBlock = false;
	// A template literal carries across lines the same way a block comment does, so `quote` lives out
	// here rather than inside the line loop.
	let quote: null | string = null;

	for (const line of lines) {
		let code = '';

		for (let i = 0; i < line.length; i++) {
			const char = line[i]!;
			const next = line[i + 1];

			if (inBlock) {
				if (char === '*' && next === '/') {
					inBlock = false;
					i++;
				}
				continue;
			}

			if (quote !== null) {
				// Neither character of an escape pair is content, and skipping the second is what keeps
				// `'it\'s'` from being read as closing here and reopening at the apostrophe.
				if (char === '\\') {
					i++;
				} else if (char === quote) {
					code += char;
					quote = null;
				}
				continue;
			}

			if (QUOTES.has(char)) {
				quote = char;
				code += char;
				continue;
			}

			// A line comment runs to the end of the line, so nothing after it can be code.
			if (char === '/' && next === '/') break;

			if (char === '/' && next === '*') {
				inBlock = true;
				i++;
				continue;
			}

			code += char;
		}

		// Only a backtick survives the line boundary. A single- or double-quoted string cannot legally
		// span one, so an unterminated one is the scan having gone wrong rather than the file, and
		// carrying it would blank every line after it.
		if (quote !== '`') quote = null;
		stripped.push(code);
	}

	return stripped;
}

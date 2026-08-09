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
 * Line count and indentation are preserved, because both callers index into the result alongside
 * the raw lines and `enclosingFunction` measures depth from what it is given.
 *
 * Where the scan cannot be exact it removes too much rather than too little, and the asymmetry is
 * deliberate. This is not a parser: a `//` inside JSX text, or the trailing delimiter of a regex
 * literal, truncates the rest of its line. Dropping real evidence produces a finding on a call that
 * has confirmation, which a reader sees and can waive. Keeping prose produces a pass on a call that
 * has none, which nobody sees at all.
 */

/** Quote characters that open a string the scan must not read comment markers inside of. */
const QUOTES = new Set(["'", '"', '`']);

/**
 * `lines` with every comment blanked, one output line per input line.
 *
 * Block comments carry across lines, which is why this takes the whole file rather than working a
 * line at a time: a `/*` opened three lines above is still open here, and a line-at-a-time scan
 * reads the prose inside it as code.
 */
export function stripComments(lines: string[]): string[] {
	const stripped: string[] = [];
	let inBlock = false;

	for (const line of lines) {
		let code = '';
		let quote: null | string = null;

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
				code += char;
				if (char === '\\') {
					code += next ?? '';
					i++;
				} else if (char === quote) {
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

		stripped.push(code);
	}

	return stripped;
}

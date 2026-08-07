/**
 * Where a destructive call site's confirmation is allowed to live, and the waiver form for the
 * sites whose confirmation this gate cannot see.
 *
 * The original evidence model was a fifteen-line window around the call and nothing else. That
 * model was written for a component that dispatches its delete inline from the JSX, and it stopped
 * describing either carrier: both now hold the dispatch in a named handler at the top of the
 * component and wire that handler to a dialog at the bottom, a hundred lines away. Six of the
 * thirteen destructive call sites across the two repositories are that shape, so a window-only
 * gate reports six findings that are all confirmed and none that are not.
 *
 * The second admissible form is therefore the handler hop: the call sits inside a named function,
 * and some line carrying a confirmation primitive names that function. `onConfirm={handleDelete}`
 * is a link a reader can follow and a gate can resolve, which is what separates it from accepting
 * the bare word "confirmation" as evidence.
 *
 * The hop is deliberately **one** level deep. Following the local call graph transitively would
 * resolve a dispatcher that a confirm handler reaches, but a dispatcher usually has other callers,
 * and marking it confirmed because one of them confirms is the laundering this gate exists to
 * prevent. `MilestonesTab.tsx` in aidd is the worked example: `run(request, false)` applies a
 * milestone plan and is reached both from the plan dialog's `onConfirm` and from a path that
 * applies trivial plans straight through. Only reading `milestonePlanNeedsReview` shows that
 * deletes never take the second path, and a gate that resolved two hops would have asserted it
 * without looking.
 */

/**
 * Concrete confirmation primitives that count as evidence. Deliberately excludes loose tokens such
 * as the bare word "confirmation"; comments and unrelated copy are not evidence of a control.
 */
export const CONFIRMATION_EVIDENCE_PATTERN =
	/ConfirmAlertDialog|ConfirmDialog|AlertDialogAction|AlertDialog|onConfirm/;

/** Lines above and below a destructive call site searched for confirmation evidence. */
export const EVIDENCE_WINDOW_LINES = 15;

/**
 * The declaration forms a handler is written in, capturing its indentation and its name. Both
 * carriers use `function name()` and `const name = () =>`; a `const` bound to anything that is not
 * a parameter list is not a function and is not matched.
 */
const DECLARATION_PATTERNS = [
	/^(\s*)(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
	/^(\s*)(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s*)?\(/,
];

/**
 * How far above a call site a handler declaration may sit. A function longer than this between its
 * signature and its destructive line is past the point where a reader would connect the two, and
 * an unbounded scan would attribute a top-level call to whatever function happened to close above.
 */
const MAX_DECLARATION_DISTANCE = 40;

/**
 * The name of the function containing `index`, or `null` when the line is not inside one.
 *
 * Resolved by scanning upward for the nearest declaration indented **less** than the call itself.
 * That indentation test is what makes the answer safe: a sibling function that closed above sits
 * at the same depth as the enclosing one, so a call at the top level of a component body finds no
 * candidate shallower than itself and correctly resolves to `null` rather than borrowing its
 * neighbour's name.
 */
export function enclosingFunction(lines: string[], index: number): null | string {
	const own = lines[index]?.match(/^\s*/)?.[0].length ?? 0;
	const stop = Math.max(0, index - MAX_DECLARATION_DISTANCE);
	for (let i = index - 1; i >= stop; i--) {
		const line = lines[i];
		if (!line) continue;
		for (const pattern of DECLARATION_PATTERNS) {
			const match = line.match(pattern);
			if (!match) continue;
			if (match[1]!.length >= own) return null;
			return match[2]!;
		}
	}
	return null;
}

/** Whether a confirmation primitive appears within the window around `index`. */
function inWindow(lines: string[], index: number): boolean {
	const start = Math.max(0, index - EVIDENCE_WINDOW_LINES);
	const end = Math.min(lines.length - 1, index + EVIDENCE_WINDOW_LINES);
	for (let i = start; i <= end; i++) {
		if (CONFIRMATION_EVIDENCE_PATTERN.test(lines[i] ?? '')) return true;
	}
	return false;
}

/** Whether a confirmation primitive anywhere in the file names the handler holding `index`. */
function viaHandler(lines: string[], index: number): boolean {
	const handler = enclosingFunction(lines, index);
	if (handler === null) return false;
	const reference = new RegExp(`\\b${handler}\\b`);
	return lines.some(
		(line, i) =>
			i !== index && CONFIRMATION_EVIDENCE_PATTERN.test(line) && reference.test(line),
	);
}

/** Whether a destructive call site at `index` has confirmation evidence in either admissible form. */
export function hasConfirmationEvidence(lines: string[], index: number): boolean {
	return inWindow(lines, index) || viaHandler(lines, index);
}

/**
 * The in-source waiver form for `check-destructive-confirmation`, and the two ways a marker stops
 * being one.
 *
 * `docs/reference/gate-conventions.md` sanctions exactly two waiver forms, and this gate uses the
 * first: a comment on or above the offending line, naming the rule and carrying a reason. That is
 * the right form here for the same reason it was right for `check-docs` — the exception belongs to
 * one call site, and the person who needs to know about it is the next person to read that line.
 *
 * It replaces `@no-confirm-required`, which named the rule but carried no reason and was never
 * verified. A marker with nothing behind it cannot be told from an oversight, and one that has
 * outlived the finding it covered becomes a standing exemption that the next unconfirmed delete
 * written on that line inherits in silence.
 *
 * Two real cases motivated keeping a waiver at all, and neither is a defect in the code:
 *
 * - **A confirmation that is not a dialog.** aidd's `DeleteProjectCard.tsx` requires the operator
 *   to type the project's full path before the submit button leaves its disabled state, and sends
 *   the typed string with the request. That is a stronger gate than a dialog, and it matches none
 *   of the confirmation primitives, because it is not one.
 * - **A dispatcher shared with non-destructive work.** aidd's `MilestonesTab.tsx` applies every
 *   milestone plan through one function. Deletes always stop at the plan dialog first, but the
 *   proof of that is in `milestonePlanNeedsReview`, not at the call site.
 */

export const WAIVER_MARKER = 'destructive-confirmation-allow:';

export interface BadWaiver {
	file: string;
	line: number;
	stale: boolean;
}

/**
 * The reason a waiver marker carries, or `null` when the line has no marker. An empty string is a
 * marker with nothing after the colon, which the caller refuses.
 */
export function waiverReason(line: string): null | string {
	const at = line.indexOf(WAIVER_MARKER);
	if (at === -1) return null;
	return line
		.slice(at + WAIVER_MARKER.length)
		.replace(/\*\/\s*$/, '')
		.trim();
}

/**
 * The line index of the marker covering `index`, or `null` when nothing covers it.
 *
 * A marker sits on the call site's own line or anywhere in the comment block directly above it.
 * The block rather than a single line, because the reasons worth writing do not fit on one: both
 * real waivers name the mechanism that stands in for the dialog, and a one-line budget would push
 * them back down to "not a dialog", which is the reasonless marker under a different spelling.
 */
export function coveringMarker(lines: string[], index: number): null | number {
	for (let i = index; i >= 0; i--) {
		const line = lines[i] ?? '';
		if (i < index && !/^\s*(?:\/\/|\/\*|\*)/.test(line)) return null;
		const reason = waiverReason(line);
		if (reason !== null && reason.length > 0) return i;
	}
	return null;
}

/** Markers that are not doing the job a marker is for. `used` holds the line indexes that were. */
export function badWaivers(filePath: string, lines: string[], used: Set<number>): BadWaiver[] {
	const found: BadWaiver[] = [];
	for (const [index, line] of lines.entries()) {
		const reason = waiverReason(line);
		if (reason === null) continue;
		if (reason.length === 0) found.push({ file: filePath, line: index + 1, stale: false });
		else if (!used.has(index)) found.push({ file: filePath, line: index + 1, stale: true });
	}
	return found;
}

export function reportWaivers(waivers: BadWaiver[]): void {
	console.error(`[FAIL] ${waivers.length} waiver marker(s) that cannot be honoured:\n`);
	for (const waiver of waivers) {
		const where = `${waiver.file}:${waiver.line}`;
		console.error(
			waiver.stale
				? `  ${where}: this marker no longer suppresses anything. The call it covered has ` +
						'confirmation the gate can see now, so delete it rather than leaving a ' +
						'standing exemption the next unconfirmed delete on that line would inherit.'
				: `  ${where}: this marker carries no reason. Write one after '${WAIVER_MARKER}'; ` +
						'a reasonless waiver cannot be told from an oversight.',
		);
	}
	console.error('');
}

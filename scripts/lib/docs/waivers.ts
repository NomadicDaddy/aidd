/**
 * The in-source waiver form for `check-docs`, and the two ways a marker stops being one.
 *
 * `docs/reference/gate-conventions.md` sanctions exactly two waiver forms, and this gate uses the
 * first: a comment on or above the offending line, naming the rule and carrying a reason. That is
 * the right form here because the exception belongs to one line and the reader of that line is
 * the person who needs to know about it. `licenses/SOURCE-OFFER.md` is the worked example — it
 * links to `SOURCE-MANIFEST.md`, which `scripts/package-release.ts` generates into each release
 * archive and which is deliberately absent from the source tree. The link is correct where the
 * file ships. Excluding the directory instead would be wrong, because that file's other links
 * (`./base-image-packages.md`, `../LICENSE`) are real and must stay checked.
 *
 * Markdown carries the marker as an HTML comment so it does not render.
 *
 * Two markers are refused rather than honoured, and both are the convention's own rules rather
 * than anything specific to documentation:
 *
 * - **No reason.** A reasonless waiver cannot be told from an oversight, and it never gets removed
 *   because nobody remembers what it was for.
 * - **Suppresses nothing.** This is "the list can only shrink" applied to the in-source form. Once
 *   the link a marker covered resolves, the marker is a standing exemption for a violation that is
 *   no longer there, and the next broken link written on that line inherits it in silence.
 */

export const WAIVER_MARKER = 'check-docs-allow:';

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
		.replace(/-->\s*$/, '')
		.trim();
}

/** Markers that are not doing the job a marker is for. `used` holds the line indexes that were. */
export function badWaivers(filePath: string, lines: string[], used: Set<number>): BadWaiver[] {
	const found: BadWaiver[] = [];
	for (const [index, line] of lines.entries()) {
		const reason = waiverReason(line);
		if (reason === null) continue;
		// A marker is allowed to sit one line above what it covers, so it counts as used if either
		// its own line or the one below it suppressed something.
		const covers = used.has(index) || used.has(index + 1);
		if (reason.length === 0) found.push({ file: filePath, line: index + 1, stale: false });
		else if (!covers) found.push({ file: filePath, line: index + 1, stale: true });
	}
	return found;
}

export function reportWaivers(waivers: BadWaiver[], describe: (file: string) => string): void {
	console.error(`[FAIL] ${waivers.length} waiver marker(s) that cannot be honoured:\n`);
	for (const waiver of waivers) {
		const where = `${describe(waiver.file)}:${waiver.line}`;
		console.error(
			waiver.stale
				? `  ${where}: this marker no longer suppresses anything. The link it covered ` +
						'resolves now, so delete it rather than leaving a standing exemption the ' +
						'next broken link on that line would inherit.'
				: `  ${where}: this marker carries no reason. Write one after '${WAIVER_MARKER}'; ` +
						'a reasonless waiver cannot be told from an oversight.',
		);
	}
	console.error('');
}

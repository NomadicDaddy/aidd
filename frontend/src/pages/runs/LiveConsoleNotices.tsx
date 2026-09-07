import { describeByteSlice, formatOutputSlice } from '../../lib/outputSlice.ts';

/**
 * The interstitials above the transcript: what this backend's stream cannot show, and how much of
 * the transcript is actually on screen. Both are advisory — they explain an absence so an operator
 * does not read it as aidd having lost output.
 */
export function LiveConsoleNotices({
	consoleLimit,
	isPretty,
	shownBytes,
	showWindowNotice,
	totalBytes,
}: {
	/** What this backend's CLI does not stream, when it streams less than the console can render. */
	consoleLimit: string | undefined;
	isPretty: boolean;
	/** Transcript bytes currently laid out, which differs between the pretty and raw views. */
	shownBytes: number;
	/** False when nothing meaningful is elided, so a complete transcript never warns. */
	showWindowNotice: boolean;
	totalBytes: number;
}) {
	const slice = describeByteSlice(shownBytes, totalBytes);
	return (
		<>
			{isPretty && consoleLimit !== undefined ? (
				<p className="mb-2 text-xs text-muted-foreground">{consoleLimit}</p>
			) : null}
			{showWindowNotice && slice.omittedBytes > 0 ? (
				<p className="mb-2 text-xs text-muted-foreground">
					{formatOutputSlice(slice, 'most recent')} Earlier lines in this loaded window
					are hidden — use the copy action for the complete window.
				</p>
			) : null}
		</>
	);
}

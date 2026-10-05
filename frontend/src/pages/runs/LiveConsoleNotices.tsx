import { describeByteSlice, formatOutputSlice } from '../../lib/outputSlice.ts';

/**
 * The interstitial above the transcript: how much of the transcript is actually on screen. It is
 * advisory — it explains an absence so an operator does not read it as aidd having lost output.
 */
export function LiveConsoleNotices({
	shownBytes,
	showWindowNotice,
	totalBytes,
}: {
	/** Transcript bytes currently laid out, which differs between the pretty and raw views. */
	shownBytes: number;
	/** False when nothing meaningful is elided, so a complete transcript never warns. */
	showWindowNotice: boolean;
	totalBytes: number;
}) {
	const slice = describeByteSlice(shownBytes, totalBytes);
	return showWindowNotice && slice.omittedBytes > 0 ? (
		<p className="mb-2 text-xs text-muted-foreground">
			{formatOutputSlice(slice, 'most recent')} Earlier lines in this loaded window are hidden
			— use the copy action for the complete window.
		</p>
	) : null;
}

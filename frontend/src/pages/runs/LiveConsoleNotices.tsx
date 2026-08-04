import { formatBytes } from '../../lib/formatters.ts';

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
	return (
		<>
			{isPretty && consoleLimit !== undefined ? (
				<p className="mb-2 text-xs text-muted-foreground">{consoleLimit}</p>
			) : null}
			{showWindowNotice ? (
				<p className="mb-2 text-xs text-muted-foreground">
					Showing the most recent {formatBytes(shownBytes)} of {formatBytes(totalBytes)}.
					Older output is hidden — use “Copy all” for the full loaded transcript.
				</p>
			) : null}
		</>
	);
}

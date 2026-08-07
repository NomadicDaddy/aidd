import { default as TriangleAlert } from 'lucide-react/dist/esm/icons/triangle-alert';

import { cn } from '../../lib/cn.ts';
import { toneText } from '../../lib/tones.ts';

/**
 * The reason an execution failed, wherever a run, session or step row shows one.
 *
 * The glyph is the point. The reason used to be a red sentence among grey ones, so the only thing
 * separating "this is what went wrong" from "this is more step detail" was the tone — and a reader
 * who cannot tell that red from the muted grey beside it was looking at an unlabelled paragraph.
 * The tone stays and the glyph says the same thing without it, which is the rule the rest of the
 * app already follows: every `Badge` that carries a state carries a word too.
 *
 * Two lines is what the STATUS column can give without taking width off the execution identity
 * beside it, so the clamp sits on the message rather than the row — clamping the flex row would
 * take the glyph with it. The `title` carries the rest, as it did before.
 *
 * One declaration for three surfaces (session row, step table row, step sub-row). Two of them were
 * writing `text-red-700 dark:text-red-300` by hand while the third imported the same pair from
 * `tones.ts`; there is one now, and it is the semantic one.
 */
export function FailureReason({ className, message }: { className?: string; message: string }) {
	return (
		<p
			className={cn('mt-1 flex items-start gap-1.5 text-xs', toneText.red, className)}
			title={message}>
			<TriangleAlert aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
			{/* The glyph is decorative, so the label it stands for is spelled out for a reader who
			    is hearing the row rather than seeing it. */}
			<span className="sr-only">Failure reason: </span>
			<span className="line-clamp-2">{message}</span>
		</p>
	);
}

import { OverflowScroller } from './OverflowScroller.tsx';

/** A fenced markdown block that keeps its authored lines inside a cue-bearing scrollport. */
export function MarkdownCodeBlock({ code }: { code: string }) {
	return (
		<OverflowScroller
			ariaLabel="Code block"
			className="max-w-full min-w-0 rounded-md bg-muted"
			scrollerClassName="p-3"
			surface="muted">
			<pre className="min-w-max font-mono text-xs whitespace-pre text-foreground">
				<code>{code}</code>
			</pre>
		</OverflowScroller>
	);
}

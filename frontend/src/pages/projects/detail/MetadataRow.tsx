import type { ReactNode } from 'react';

export function MetadataRow({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
			<span className="text-xs tracking-wide text-muted-foreground uppercase">{label}</span>
			{/* `min-w-0`: the values are not all short strings — one is an execution identity badge
			    beside a link, another is a stack display — and without it a flex item cannot shrink
			    below its content, so in a 310px card the value pushes out of the row instead of
			    wrapping inside it. */}
			<span className="min-w-0 text-right text-foreground">{value}</span>
		</div>
	);
}

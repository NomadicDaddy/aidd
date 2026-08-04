import type { ReactNode } from 'react';

export function MetadataRow({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
			<span className="text-xs tracking-wide text-muted-foreground uppercase">{label}</span>
			<span className="text-right text-foreground">{value}</span>
		</div>
	);
}

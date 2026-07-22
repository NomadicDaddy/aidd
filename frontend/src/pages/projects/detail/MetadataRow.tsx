import type { ReactNode } from 'react';

export function MetadataRow({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
			<span className="text-xs tracking-wide text-neutral-500 uppercase">{label}</span>
			<span className="text-right text-neutral-900 dark:text-neutral-100">{value}</span>
		</div>
	);
}

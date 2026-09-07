import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as Clock } from 'lucide-react/dist/esm/icons/clock';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { useState } from 'react';

import type { FreshnessPresentation, FreshnessSource } from './dataFreshness.ts';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { useNow } from '../../hooks/useNow.ts';
import { cn } from '../../lib/cn.ts';
import { toneText } from '../../lib/tones.ts';
import { Button } from '../ui/button.tsx';
import { freshnessPresentation, refreshCompletionAnnouncement } from './dataFreshness.ts';

function FreshnessStatus({ presentation }: { presentation: FreshnessPresentation }) {
	const icon =
		presentation.kind === 'fetching' ? (
			<RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
		) : presentation.kind === 'error' ? (
			<AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
		) : (
			<Clock aria-hidden="true" className="h-3.5 w-3.5" />
		);

	return (
		<span
			className={cn(
				'inline-flex items-center gap-1.5 text-xs tabular-nums',
				presentation.kind === 'error' ? toneText.red : 'text-muted-foreground',
			)}>
			{icon}
			{presentation.text}
		</span>
	);
}

/**
 * Named per-query freshness plus one refresh affordance for data-heavy pages. The resting summary
 * describes the surface's primary query; the keyboard- and touch-reachable disclosure attributes
 * age, loading, and errors to every represented query. Only an operator-triggered refresh writes
 * to the polite live region, once, when the complete multi-query refresh settles.
 */
export function DataFreshness({
	className,
	label,
	onRefresh,
	refreshLabel = 'Refresh',
	sources,
}: {
	className?: string;
	label: string;
	onRefresh: () => Promise<boolean>;
	refreshLabel?: string;
	sources: readonly FreshnessSource[];
}) {
	const now = useNow(true);
	const [announcement, setAnnouncement] = useState('');
	const [refreshPending, setRefreshPending] = useState(false);
	const presentations = sources.map((source) => ({
		...source,
		presentation: freshnessPresentation(source.query, now),
	}));
	const primary = presentations[0];
	const summaryLabel = sources.length > 1 ? label : (primary?.label ?? label);
	const isFetching = sources.some((source) => source.query.isFetching);
	const isRefreshing = isFetching || refreshPending;

	function handleRefresh(): void {
		setAnnouncement('');
		setRefreshPending(true);
		void Promise.resolve()
			.then(onRefresh)
			.then(
				(succeeded) => setAnnouncement(refreshCompletionAnnouncement(label, succeeded)),
				() => setAnnouncement(refreshCompletionAnnouncement(label, false)),
			)
			.finally(() => setRefreshPending(false));
	}

	return (
		<div
			className={cn(
				'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:w-auto',
				className,
			)}>
			<details className="group relative min-w-0">
				<summary className="flex min-h-11 w-full min-w-0 cursor-pointer list-none items-center gap-1.5 overflow-hidden rounded-md px-1.5 text-xs outline-none marker:content-none focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-8">
					<span className="min-w-0 font-medium text-foreground">{summaryLabel}</span>
					{primary ? (
						<span className="shrink-0 whitespace-nowrap">
							<FreshnessStatus presentation={primary.presentation} />
						</span>
					) : (
						<span className="text-muted-foreground">No sources</span>
					)}
					{sources.length > 1 ? (
						<span className="shrink-0 text-muted-foreground max-sm:hidden">
							{sources.length} sources
						</span>
					) : null}
					<DisclosureMarker />
				</summary>
				<div className="absolute right-0 z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-card p-3 shadow-lg max-sm:right-auto max-sm:left-0">
					<p className="mb-2 text-xs font-medium text-foreground">{label} freshness</p>
					<dl className="space-y-2">
						{presentations.map((source) => (
							<div
								className="flex min-w-0 items-center justify-between gap-3"
								key={source.label}>
								<dt className="min-w-0 truncate text-xs text-foreground">
									{source.label}
								</dt>
								<dd className="shrink-0">
									<FreshnessStatus presentation={source.presentation} />
								</dd>
							</div>
						))}
					</dl>
				</div>
			</details>
			<Button
				aria-label={`${refreshLabel} ${label}`}
				disabled={isRefreshing}
				onClick={handleRefresh}
				size="compact"
				variant="secondary">
				<RefreshCw
					aria-hidden="true"
					className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')}
				/>
				<span className="hidden sm:inline">{refreshLabel}</span>
			</Button>
			<span aria-live="polite" className="sr-only">
				{announcement}
			</span>
		</div>
	);
}

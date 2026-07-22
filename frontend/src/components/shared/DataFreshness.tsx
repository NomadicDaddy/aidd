import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as Clock } from 'lucide-react/dist/esm/icons/clock';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { useEffect, useRef, useState } from 'react';

import { useNow } from '../../hooks/useNow.ts';
import { cn } from '../../lib/cn.ts';
import { formatUpdatedAgo } from '../../lib/formatters.ts';
import { Button } from '../ui/button.tsx';

// The minimal slice of a TanStack Query result the indicator reads. Any `useQuery` /
// `useInfiniteQuery` result satisfies this structurally, so callers pass their query objects
// directly instead of threading a bespoke per-page refresh state machine.
export interface FreshnessQuery {
	dataUpdatedAt: number;
	errorUpdatedAt: number;
	isError: boolean;
	isFetching: boolean;
}

// Collapses the queries a surface represents into a single freshness signal: the data is only as
// fresh as its stalest query (oldest `dataUpdatedAt`), it is "fetching" if any query is in flight,
// and it is "errored" if any query failed outright (`isError`) or its most recent settle was a
// failure layered over still-displayed stale data (`errorUpdatedAt` newer than `dataUpdatedAt`).
function mergeFreshness(queries: FreshnessQuery[]): {
	dataUpdatedAt: number;
	isError: boolean;
	isFetching: boolean;
} {
	let dataUpdatedAt = 0;
	let isFetching = false;
	let isError = false;
	for (const query of queries) {
		if (query.dataUpdatedAt > 0) {
			dataUpdatedAt =
				dataUpdatedAt === 0
					? query.dataUpdatedAt
					: Math.min(dataUpdatedAt, query.dataUpdatedAt);
		}
		if (query.isFetching) isFetching = true;
		if (
			query.isError ||
			(query.errorUpdatedAt > 0 && query.errorUpdatedAt > query.dataUpdatedAt)
		) {
			isError = true;
		}
	}
	return { dataUpdatedAt, isError, isFetching };
}

/**
 * Shared "updated Ns ago" + single refresh affordance for data-heavy pages. Derives its label and
 * in-flight/error state from the TanStack Query metadata of the queries it represents (no hand-
 * rolled per-page state machine). The relative label advances on a 1s clock without refetching,
 * and meaningful state changes (refreshing -> updated/failed) for an operator-initiated refresh are
 * announced through a polite live region; background refetches stay silent to avoid chatter.
 */
export function DataFreshness({
	className,
	label,
	onRefresh,
	queries,
	refreshLabel = 'Refresh',
}: {
	className?: string;
	label: string;
	onRefresh: () => void;
	queries: FreshnessQuery[];
	refreshLabel?: string;
}) {
	const { dataUpdatedAt, isError, isFetching } = mergeFreshness(queries);
	const now = useNow(true);
	const [announcement, setAnnouncement] = useState('');
	const wasFetchingRef = useRef(isFetching);
	const userInitiatedRef = useRef(false);

	useEffect(() => {
		const wasFetching = wasFetchingRef.current;
		wasFetchingRef.current = isFetching;
		// Only narrate refreshes the operator triggered; background polls/refetches must not chatter.
		if (!userInitiatedRef.current) return;
		if (isFetching && !wasFetching) {
			setAnnouncement(`Refreshing ${label}…`);
		} else if (!isFetching && wasFetching) {
			userInitiatedRef.current = false;
			setAnnouncement(isError ? `${label} failed to refresh.` : `${label} updated.`);
		}
	}, [isFetching, isError, label]);

	function handleRefresh() {
		userInitiatedRef.current = true;
		// Announce immediately so feedback is given even when a refetch resolves from cache before
		// an isFetching transition is ever observed.
		if (!isFetching) setAnnouncement(`Refreshing ${label}…`);
		onRefresh();
	}

	const status = isFetching
		? {
				className: 'text-muted-foreground',
				icon: <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />,
				text: 'Refreshing…',
			}
		: isError
			? {
					className: 'text-red-600 dark:text-red-300',
					icon: <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />,
					text: 'Refresh failed',
				}
			: {
					className: 'text-muted-foreground',
					icon: <Clock aria-hidden="true" className="h-3.5 w-3.5" />,
					text:
						dataUpdatedAt > 0
							? `Updated ${formatUpdatedAgo(dataUpdatedAt, now)}`
							: 'Not yet loaded',
				};

	return (
		<div className={cn('flex items-center gap-2', className)}>
			<span className={cn('inline-flex items-center gap-1.5 text-xs', status.className)}>
				{status.icon}
				{status.text}
			</span>
			<Button
				aria-label={`${refreshLabel} ${label}`}
				disabled={isFetching}
				onClick={handleRefresh}
				size="compact"
				variant="secondary">
				<RefreshCw
					aria-hidden="true"
					className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')}
				/>
				<span className="hidden sm:inline">{isError ? 'Retry' : refreshLabel}</span>
			</Button>
			<span aria-live="polite" className="sr-only">
				{announcement}
			</span>
		</div>
	);
}

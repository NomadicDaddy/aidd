import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { Link } from 'react-router';

import type { DashboardActivityItem } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { FilterToolbarReadout } from '../../components/shared/FilterToolbarReadout.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { RelativeAge } from '../../components/shared/RelativeAge.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader, cardHeaderLinkClass } from '../../components/ui/card.tsx';
import { formatDuration } from '../../lib/formatters.ts';
import { tableMeasureClass } from '../../lib/tableStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { runStatusTone } from '../projects/detail/shared.ts';

/**
 * The same detail line the project page builds from the same entry: the launch source and the
 * rendered duration. Both surfaces read `aidd-shared/runs/activity` for the entry itself, so this
 * is the only thing left to keep in step, and it is formatting.
 */
function detailParts(item: DashboardActivityItem): string[] {
	const duration = item.durationMs ? formatDuration(item.durationMs) : null;
	return [item.sourceLabel, duration].filter((part): part is string => part !== null);
}

function ActivityRow({ item }: { item: DashboardActivityItem }) {
	return (
		<li className="group px-1 py-2">
			<div className="flex flex-wrap items-baseline justify-between gap-x-2">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<Badge tone={runStatusTone(item.status)}>{item.statusLabel}</Badge>
					<Link
						className={`truncate font-medium text-foreground hover:text-accent ${touchTargetTextClass}`}
						title={item.traceLabel}
						to={`/projects/${item.projectId}`}>
						{item.projectName}
					</Link>
					<span className="truncate text-muted-foreground">{item.title}</span>
				</div>
				<span className="shrink-0 text-xs text-muted-foreground">
					<RelativeAge value={item.timestamp} />
				</span>
			</div>
			<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
				{item.executionIdentity ? (
					<ExecutionIdentityBadges {...item.executionIdentity} />
				) : null}
				{detailParts(item).map((part) => (
					<span key={part}>{part}</span>
				))}
			</div>
			{item.summary ? (
				<p className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={item.summary}>
					{item.summary}
				</p>
			) : null}
		</li>
	);
}

export function FleetActivityCard({
	isError,
	isLoading,
	items,
	onRetry,
	total,
}: {
	isError: boolean;
	isLoading: boolean;
	items: DashboardActivityItem[];
	onRetry: () => void;
	total: number;
}) {
	return (
		<Card variant="panel">
			<CardHeader
				action={
					<Link className={cardHeaderLinkClass} to="/runs">
						Runs
						<ArrowRight className="h-3.5 w-3.5" />
					</Link>
				}
				badge={
					<Badge tone="neutral">
						{total} {total === 1 ? 'entry' : 'entries'}
					</Badge>
				}
				description="The newest runs and iterations recorded across the fleet."
				icon={<Activity className={`h-4 w-4 ${toneText.teal}`} />}
				title="Recent Activity"
			/>
			{/* The readout gates itself on its container, not the viewport, so it needs one: with no
			    `@container` ancestor every one of its `@max-` variants is inert and the row keeps the
			    wide alignment at 390, where the caption was measured alone over 186px of a 324px card.
			    The card is the measure the count is counting against, so the card is the container. */}
			<div className="@container mb-3">
				<FilterToolbarReadout
					filtered={items.length}
					noun="entries"
					responsiveScope="viewport"
					total={total}
				/>
			</div>
			<OverflowScroller
				ariaLabel="Recent fleet activity"
				className={`-mx-2 px-2 ${tableMeasureClass}`}
				scrollerClassName="text-sm">
				{items.length > 0 ? (
					<ul
						aria-label="Recent fleet activity entries"
						className="divide-y divide-border">
						{items.map((item) => (
							<ActivityRow item={item} key={item.id} />
						))}
					</ul>
				) : isError ? (
					<EmptyState
						action={
							<Button className="text-xs" onClick={onRetry} variant="secondary">
								<RefreshCw className="h-3.5 w-3.5" />
								Retry
							</Button>
						}>
						Failed to load recent activity.
					</EmptyState>
				) : isLoading ? (
					<SkeletonLines count={6} label="Loading recent activity…" />
				) : (
					<EmptyState
						action={
							<Link className={buttonClassName('secondary')} to="/runs">
								Runs
								<ArrowRight className="h-3.5 w-3.5" />
							</Link>
						}>
						No runs recorded yet.
					</EmptyState>
				)}
			</OverflowScroller>
		</Card>
	);
}

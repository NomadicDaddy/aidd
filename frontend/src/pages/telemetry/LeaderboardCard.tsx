import type { ResourceUsageRow } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { Card } from '../../components/ui/card.tsx';
import { cn } from '../../lib/cn.ts';
import { formatDuration, formatRelativeAge } from '../../lib/formatters.ts';
import { machineLabelClass } from '../../lib/typography.ts';
import {
	emptyTelemetryResourceAvailability,
	type TelemetryResourceAvailability,
} from './resourceLink.ts';
import { TelemetryResourceName } from './TelemetryResourceName.tsx';

function outcomeBreakdown(row: ResourceUsageRow): string {
	const outcomes = [
		{ count: row.completed, label: 'completed' },
		{ count: row.warnings, label: row.warnings === 1 ? 'warning' : 'warnings' },
		{ count: row.failed, label: 'failed' },
		{ count: row.flagged, label: 'flagged' },
		{ count: row.stopped, label: 'stopped' },
		{ count: row.killed, label: 'killed' },
		{ count: row.noWork, label: 'no work' },
		{ count: row.running, label: 'running' },
	];
	return outcomes
		.filter((outcome) => outcome.count > 0)
		.map((outcome) => `${outcome.count} ${outcome.label}`)
		.join(' · ');
}

export function LeaderboardCard({
	availableResources = emptyTelemetryResourceAvailability,
	rows,
}: {
	availableResources?: TelemetryResourceAvailability;
	rows: ResourceUsageRow[];
}) {
	if (rows.length === 0) return <EmptyState>No invocations recorded yet.</EmptyState>;
	const totals = rows.map((row) => row.total);
	const max = Math.max(...totals, 1);
	// A bar scaled against the maximum encodes nothing when every row holds the same count: ten
	// identical full-width bars spent the strongest colour on the card to say "these are equal",
	// which the tabular counts already say. Drop the bar in that case rather than draw a lie.
	const ranks = max !== Math.min(...totals);
	return (
		/*
		 * Two columns once the card is wide enough for them. Ten single-file rows made the left
		 * column 1180px tall against a 692px stack of three charts on the right, so at 2250 the
		 * page carried an 876x488 void beside the leaderboard's lower half — the largest empty
		 * region on any surface in the app. Halving the row count is what closes it; widening the
		 * charts instead would have made the right column shorter and the void bigger.
		 *
		 * Filling row-major is fine here because every entry prints its own `#N`: the rank is read
		 * off the row, not inferred from its position in the column.
		 */
		<ol className="grid grid-cols-[minmax(0,1fr)] gap-2 @min-[45rem]:grid-cols-2">
			{rows.map((row, index) => {
				const width = Math.round((row.total / max) * 100);
				return (
					<li className="min-w-0" key={`${row.resourceType}:${row.resourceId}`}>
						{/* A sunken fill rather than a second border of the same weight as the card
						    that contains it — the nesting reads by surface, not by outline. */}
						<Card className="p-3" variant="sunken">
							<div className="flex items-baseline justify-between gap-3">
								<div className="min-w-0 flex-1">
									<TelemetryResourceName
										availableResources={availableResources}
										className="text-sm font-medium text-foreground"
										id={row.resourceId}
										name={row.resourceName}
										type={row.resourceType}>
										<span className="text-muted-foreground">#{index + 1}</span>{' '}
										{row.resourceName}
									</TelemetryResourceName>
									{/* The id half is the same slug the Recipes grid prints in its
									    `identifier` slot; the type half is a machine enum. Both are
									    strings the app matches on, not words it wrote. */}
									<p
										className={cn(
											machineLabelClass,
											'font-mono text-xs text-muted-foreground',
										)}
										title={`${row.resourceType} · ${row.resourceId}`}>
										{row.resourceType} · {row.resourceId}
									</p>
								</div>
								<div className="shrink-0 text-right">
									<div className="text-sm font-semibold text-foreground tabular-nums">
										{row.total}
									</div>
									<div className="text-2xs text-muted-foreground">
										{outcomeBreakdown(row)}
									</div>
								</div>
							</div>
							{ranks ? (
								<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
									<div
										aria-hidden="true"
										className="h-full rounded-full bg-accent"
										style={{ width: `${width}%` }}
									/>
								</div>
							) : null}
							<div className="mt-1.5 flex flex-wrap justify-between gap-2 text-2xs text-muted-foreground">
								<span className="space-x-2">
									<span>{row.topLevel} top-level</span>
									<span>{row.nested} nested</span>
								</span>
								<span className="tabular-nums">
									{row.lastUsedAt
										? `last ${formatRelativeAge(new Date(row.lastUsedAt).toISOString())}`
										: 'never used'}{' '}
									·{' '}
									{row.avgDurationMs !== null
										? `avg ${formatDuration(row.avgDurationMs)}`
										: '—'}
								</span>
							</div>
						</Card>
					</li>
				);
			})}
		</ol>
	);
}

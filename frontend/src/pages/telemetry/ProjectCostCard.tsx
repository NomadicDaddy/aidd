import type { TelemetryProjectCostRow } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { FilePath } from '../../components/shared/FilePath.tsx';
import { Card } from '../../components/ui/card.tsx';
import { formatRelativeAge } from '../../lib/formatters.ts';
import { formatProjectCost, projectCostCoverage } from './projectCostPresenter.ts';

/**
 * Reported spend per project over the window the toolbar selects.
 *
 * Every figure comes from the server aggregation over the full filtered invocation set, not from
 * the Recent invocations table below: that table is capped at the latest 50 rows, so summing it in
 * the browser would quietly report a fraction of the window as the whole of it.
 */
export function ProjectCostCard({ rows }: { rows: TelemetryProjectCostRow[] }) {
	if (rows.length === 0) {
		return <EmptyState>No project invocations in the selected filters.</EmptyState>;
	}
	const costs = rows.map((row) => row.costUsd);
	const max = Math.max(...costs, 0);
	// The same rule the leaderboard uses: a bar scaled against the maximum says nothing when every
	// row holds the same figure, and says nothing at all when no row reported cost.
	const ranks = max > 0 && max !== Math.min(...costs);
	return (
		<ol
			className={`grid grid-cols-[minmax(0,1fr)] gap-2 ${rows.length > 1 ? '@min-[45rem]:grid-cols-2' : ''}`}>
			{rows.map((row) => (
				<li className="min-w-0" key={row.projectPath}>
					<Card className="p-3" variant="sunken">
						<div className="flex items-baseline justify-between gap-3">
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium text-foreground">
									{row.projectName}
								</p>
								<FilePath
									className="block truncate text-xs text-muted-foreground"
									path={row.projectPath}
								/>
							</div>
							<div className="shrink-0 text-right">
								<div className="text-sm font-semibold text-foreground tabular-nums">
									{formatProjectCost(row)}
								</div>
								<div className="text-2xs text-muted-foreground">
									{projectCostCoverage(row)}
								</div>
							</div>
						</div>
						{ranks ? (
							<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
								<div
									aria-hidden="true"
									className="h-full rounded-full bg-accent"
									style={{ width: `${Math.round((row.costUsd / max) * 100)}%` }}
								/>
							</div>
						) : null}
						<div className="mt-1.5 flex flex-wrap justify-between gap-2 text-2xs text-muted-foreground">
							<span className="tabular-nums">
								{row.invocationCount}{' '}
								{row.invocationCount === 1 ? 'invocation' : 'invocations'}
							</span>
							<span className="tabular-nums">
								last{' '}
								{formatRelativeAge(new Date(row.lastInvocationAt).toISOString())}
							</span>
						</div>
					</Card>
				</li>
			))}
		</ol>
	);
}

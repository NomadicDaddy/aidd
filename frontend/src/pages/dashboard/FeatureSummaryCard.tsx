import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { default as ListChecks } from 'lucide-react/dist/esm/icons/list-checks';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { Link } from 'react-router';

import type { FeatureSummary, ProjectSummary } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader, cardHeaderLinkClass } from '../../components/ui/card.tsx';
import { toneText } from '../../lib/tones.ts';

interface FeatureSummaryColumn {
	align: 'left' | 'right';
	header: string;
	value: (row: FeatureSummaryRow) => number | string;
}

interface FeatureSummaryRow extends FeatureSummary {
	application: string;
}

const summaryColumns: FeatureSummaryColumn[] = [
	{
		align: 'left',
		header: 'Application',
		value: (row) => row.application,
	},
	{
		align: 'right',
		header: 'Audit',
		value: (row) => row.audit,
	},
	{
		align: 'right',
		header: 'Remediation',
		value: (row) => row.remediation,
	},
	{
		align: 'right',
		header: 'Feature',
		value: (row) => row.feature,
	},
	{
		align: 'right',
		header: 'Pending',
		value: (row) => row.pending,
	},
	{
		align: 'right',
		header: 'Completed',
		value: (row) => row.completed,
	},
	{
		align: 'right',
		header: 'Total',
		value: (row) => row.total,
	},
];

function emptyFeatureSummary(): FeatureSummary {
	return {
		audit: 0,
		completed: 0,
		feature: 0,
		pending: 0,
		remediation: 0,
		total: 0,
	};
}

function projectFeatureSummary(project: ProjectSummary): FeatureSummary {
	if (project.featureSummary) {
		return project.featureSummary;
	}

	const completed = project.featureStats.closed;
	const total = project.featureStats.total;

	return {
		audit: 0,
		completed,
		feature: total,
		pending: Math.max(total - completed, 0),
		remediation: 0,
		total,
	};
}

function aggregateFeatureSummary(projects: ProjectSummary[]): FeatureSummary {
	return projects.reduce((summary, project) => {
		const featureSummary = projectFeatureSummary(project);
		summary.audit += featureSummary.audit;
		summary.completed += featureSummary.completed;
		summary.feature += featureSummary.feature;
		summary.pending += featureSummary.pending;
		summary.remediation += featureSummary.remediation;
		summary.total += featureSummary.total;
		return summary;
	}, emptyFeatureSummary());
}

function projectSummaryRows(projects: ProjectSummary[]): FeatureSummaryRow[] {
	return projects
		.map((project) => ({
			application: project.name,
			...projectFeatureSummary(project),
		}))
		.sort((left, right) => left.application.localeCompare(right.application));
}

export function FeatureSummaryCard({
	isError,
	isLoading,
	onRetry,
	projects,
}: {
	isError: boolean;
	isLoading: boolean;
	onRetry: () => void;
	projects: ProjectSummary[];
}) {
	const rows = projectSummaryRows(projects);
	const totals = aggregateFeatureSummary(projects);
	const pendingTone = totals.pending > 0 ? 'amber' : 'emerald';

	return (
		<Card className="overflow-hidden" variant="panel">
			<CardHeader
				action={
					<Link className={cardHeaderLinkClass} to="/projects">
						Projects
						<ArrowRight className="h-3.5 w-3.5" />
					</Link>
				}
				badge={
					<Badge showDot tone={pendingTone}>
						{totals.pending} pending
					</Badge>
				}
				description="Fleet feature counts by application and backlog type."
				icon={<ListChecks className={`h-4 w-4 ${toneText.teal}`} />}
				title="Feature Summary"
			/>

			<div className="mb-4 grid gap-3 sm:grid-cols-3">
				<div className="rounded-md bg-amber-50 p-3 dark:bg-amber-950/20">
					<div className="text-xs font-medium text-amber-700 uppercase dark:text-amber-300">
						Pending
					</div>
					<div className="mt-1 text-lg font-semibold text-amber-950 tabular-nums dark:text-amber-100">
						{totals.pending}
					</div>
				</div>
				<div className="rounded-md bg-emerald-50 p-3 dark:bg-emerald-950/20">
					<div className="text-xs font-medium text-emerald-700 uppercase dark:text-emerald-300">
						Completed
					</div>
					<div className="mt-1 text-lg font-semibold text-emerald-950 tabular-nums dark:text-emerald-100">
						{totals.completed}
					</div>
				</div>
				<div className="rounded-md bg-teal-50 p-3 dark:bg-teal-950/20">
					<div className="text-xs font-medium text-teal-700 uppercase dark:text-teal-300">
						Total
					</div>
					<div className="mt-1 text-lg font-semibold text-teal-950 tabular-nums dark:text-teal-100">
						{totals.total}
					</div>
				</div>
			</div>

			{isLoading && rows.length === 0 ? (
				<SkeletonLines count={5} label="Loading feature summary…" />
			) : isError ? (
				<EmptyState
					action={
						<Button className="h-9 text-xs" onClick={onRetry} variant="secondary">
							<RefreshCw className="h-3.5 w-3.5" />
							Retry
						</Button>
					}>
					Failed to load feature summary.
				</EmptyState>
			) : rows.length === 0 ? (
				<EmptyState
					action={
						<Link className={buttonClassName('secondary')} to="/settings">
							Configure project roots
							<ArrowRight className="h-3.5 w-3.5" />
						</Link>
					}>
					No projects discovered.
				</EmptyState>
			) : (
				<div className="-mx-2 overflow-x-auto px-2">
					<table className="min-w-[700px] text-sm">
						<thead>
							<tr className="border-b border-border text-xs font-medium text-muted-foreground uppercase">
								{summaryColumns.map((column) => (
									<th
										className={
											column.align === 'right'
												? 'px-3 py-2 text-right'
												: 'px-3 py-2 text-left'
										}
										key={column.header}>
										{column.header}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr
									className="border-b border-border last:border-b-0"
									key={row.application}>
									{summaryColumns.map((column) => (
										<td
											className={
												column.align === 'right'
													? 'px-3 py-2 text-right font-medium text-foreground tabular-nums'
													: 'max-w-52 truncate px-3 py-2 font-medium text-foreground'
											}
											key={column.header}>
											{column.value(row)}
										</td>
									))}
								</tr>
							))}
						</tbody>
						<tfoot>
							<tr className="border-t border-border text-sm font-semibold text-foreground">
								{summaryColumns.map((column) => (
									<td
										className={
											column.align === 'right'
												? 'px-3 pt-3 text-right tabular-nums'
												: 'px-3 pt-3 text-left'
										}
										key={column.header}>
										{column.header === 'Application'
											? 'Total'
											: column.value({ application: 'Total', ...totals })}
									</td>
								))}
							</tr>
						</tfoot>
					</table>
				</div>
			)}
		</Card>
	);
}

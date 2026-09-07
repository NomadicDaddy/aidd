import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { default as ListChecks } from 'lucide-react/dist/esm/icons/list-checks';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { Link } from 'react-router';

import type { DashboardProjectSummary, FeatureSummary } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader, cardHeaderLinkClass } from '../../components/ui/card.tsx';
import { toneText } from '../../lib/tones.ts';
import { type FeatureSummaryRow, FeatureSummaryRows } from './FeatureSummaryRows.tsx';

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

function aggregateFeatureSummary(projects: DashboardProjectSummary[]): FeatureSummary {
	return projects.reduce((summary, project) => {
		const featureSummary = project.featureSummary;
		summary.audit += featureSummary.audit;
		summary.completed += featureSummary.completed;
		summary.feature += featureSummary.feature;
		summary.pending += featureSummary.pending;
		summary.remediation += featureSummary.remediation;
		summary.total += featureSummary.total;
		return summary;
	}, emptyFeatureSummary());
}

function projectSummaryRows(projects: DashboardProjectSummary[]): FeatureSummaryRow[] {
	return projects
		.map((project) => ({
			application: project.name,
			...project.featureSummary,
		}))
		.sort((left, right) => left.application.localeCompare(right.application));
}

/**
 * One shell and one tint weight for the mini-metric trio. Rendered as bare fills, the emerald and
 * teal tiles sat so close to `--card` in dark mode that only the amber one read as a box, so two of
 * three numbers floated unattached beside a boxed sibling.
 */
export function FeatureSummaryCard({
	isError,
	isLoading,
	onRetry,
	projects,
}: {
	isError: boolean;
	isLoading: boolean;
	onRetry: () => void;
	projects: DashboardProjectSummary[];
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

			{isLoading && rows.length === 0 ? (
				<SkeletonLines count={5} label="Loading feature summary…" />
			) : isError ? (
				<EmptyState
					action={
						<Button className="text-xs" onClick={onRetry} variant="secondary">
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
				<FeatureSummaryRows rows={rows} totals={totals} />
			)}
		</Card>
	);
}

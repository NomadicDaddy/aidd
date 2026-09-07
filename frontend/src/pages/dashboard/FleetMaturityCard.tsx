import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { default as Gauge } from 'lucide-react/dist/esm/icons/gauge';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { Link } from 'react-router';

import type { DashboardProjectSummary } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { FilterToolbarReadout } from '../../components/shared/FilterToolbarReadout.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { MaturityRing } from '../../components/shared/MaturityRing.tsx';
import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader, cardHeaderLinkClass } from '../../components/ui/card.tsx';
import { tableMeasureClass } from '../../lib/tableStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { DASHBOARD_CARD_MAX_ROWS } from './dashboard-shared.ts';

/**
 * Least mature first, so the rows are the projects with work left rather than the alphabetical
 * head of the fleet. Ties fall back to name, which keeps the order stable between refetches.
 */
function leastMatureFirst(projects: DashboardProjectSummary[]): DashboardProjectSummary[] {
	return [...projects].sort((left, right) => {
		const byPercent = left.maturity.percent - right.maturity.percent;
		if (byPercent !== 0) return byPercent;
		return left.name.localeCompare(right.name);
	});
}

function fleetPercent(projects: DashboardProjectSummary[]): number {
	if (projects.length === 0) return 0;
	const total = projects.reduce((sum, project) => sum + project.maturity.percent, 0);
	return Math.round(total / projects.length);
}

// emerald is claimed only by the model's own "every stage complete" state. A percentage
// threshold picked here would be severity invented from a raw number, which the tone scale
// forbids: see the contract at the top of lib/tones.ts.
function isFullyMature(project: DashboardProjectSummary): boolean {
	const { stageStatuses } = project.maturity;
	return stageStatuses.length > 0 && stageStatuses.every((stage) => stage.status === 'complete');
}

function MaturityRow({ project }: { project: DashboardProjectSummary }) {
	const { maturity } = project;
	const nextStep = maturity.nextArtifactLabel ?? 'Nothing outstanding';
	return (
		<div className="flex items-center gap-3 px-1 py-1.5">
			<MaturityRing
				ariaLabel={`${project.name} maturity ${maturity.percent}%`}
				percent={maturity.percent}
				size={36}
				stages={maturity.stageStatuses}
			/>
			<div className="min-w-0 flex-1">
				<Link
					className={`block truncate font-medium text-foreground hover:text-accent ${touchTargetTextClass}`}
					to={`/projects/${project.routeId}`}>
					{project.name}
				</Link>
				<p className="truncate text-xs text-muted-foreground" title={nextStep}>
					Next: {nextStep}
				</p>
			</div>
			<div className="shrink-0 text-right">
				<Badge tone={isFullyMature(project) ? 'emerald' : 'neutral'}>
					{maturity.percent}%
				</Badge>
				<p className="mt-0.5 text-xs text-muted-foreground">
					{maturity.currentStageLabel ?? 'Not started'}
				</p>
			</div>
		</div>
	);
}

export function FleetMaturityCard({
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
	const ordered = leastMatureFirst(projects).slice(0, DASHBOARD_CARD_MAX_ROWS);
	return (
		<Card variant="panel">
			<CardHeader
				action={
					<Link className={cardHeaderLinkClass} to="/projects">
						Projects
						<ArrowRight className="h-3.5 w-3.5" />
					</Link>
				}
				badge={<Badge tone="neutral">{fleetPercent(projects)}% fleet</Badge>}
				description="Maturity stage and the next artifact each project owes."
				icon={<Gauge className={`h-4 w-4 ${toneText.teal}`} />}
				title="Fleet Maturity"
			/>
			{/* The readout gates itself on its container, not the viewport, so it needs one: with no
			    `@container` ancestor every one of its `@max-` variants is inert and the row keeps the
			    wide alignment at 390, where the caption was measured alone over 186px of a 324px card.
			    The card is the measure the count is counting against, so the card is the container. */}
			<div className="@container mb-3">
				<FilterToolbarReadout
					filtered={ordered.length}
					noun="projects"
					responsiveScope="viewport"
					total={projects.length}
				/>
			</div>
			<OverflowScroller
				ariaLabel="Fleet maturity by project"
				className={`-mx-2 px-2 ${tableMeasureClass}`}
				scrollerClassName="divide-y divide-border">
				{projects.length > 0 ? (
					ordered.map((project) => <MaturityRow key={project.id} project={project} />)
				) : isError ? (
					<EmptyState
						action={
							<Button className="text-xs" onClick={onRetry} variant="secondary">
								<RefreshCw className="h-3.5 w-3.5" />
								Retry
							</Button>
						}>
						Failed to load fleet maturity.
					</EmptyState>
				) : isLoading ? (
					<SkeletonLines count={6} label="Loading fleet maturity…" />
				) : (
					<EmptyState
						action={
							<Link className={buttonClassName('secondary')} to="/settings">
								Configure project roots
								<ArrowRight className="h-3.5 w-3.5" />
							</Link>
						}>
						No projects discovered.
					</EmptyState>
				)}
			</OverflowScroller>
		</Card>
	);
}

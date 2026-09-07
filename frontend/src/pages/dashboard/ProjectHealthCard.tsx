import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';
import { Link } from 'react-router';

import type { DashboardProjectSummary } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { FilterToolbarReadout } from '../../components/shared/FilterToolbarReadout.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader, cardHeaderLinkClass } from '../../components/ui/card.tsx';
import { tableMeasureClass } from '../../lib/tableStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { DASHBOARD_CARD_MAX_ROWS } from './dashboard-shared.ts';
import { ProjectHealthRow } from './ProjectHealthRow.tsx';

export function ProjectHealthCard({
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
	const displayedProjects = projects.slice(0, DASHBOARD_CARD_MAX_ROWS);
	return (
		<Card variant="panel">
			<CardHeader
				action={
					<Link className={cardHeaderLinkClass} to="/projects">
						Projects
						<ArrowRight className="h-3.5 w-3.5" />
					</Link>
				}
				badge={
					<Badge tone="neutral">
						{projects.length} {projects.length === 1 ? 'project' : 'projects'}
					</Badge>
				}
				description="Per-project priority health and feature progress."
				icon={<ShieldCheck className={`h-4 w-4 ${toneText.teal}`} />}
				title="Project Health"
			/>
			{/* Keep the landing view bounded to the same preview count as the two fleet tables.
			    The Projects route remains the complete inventory. */}
			{/* The readout gates itself on its container, not the viewport, so it needs one: with no
			    `@container` ancestor every one of its `@max-` variants is inert and the row keeps the
			    wide alignment at 390, where the caption was measured alone over 186px of a 324px card.
			    The card is the measure the count is counting against, so the card is the container. */}
			<div className="@container mb-3">
				<FilterToolbarReadout
					filtered={displayedProjects.length}
					noun="projects"
					responsiveScope="viewport"
					total={projects.length}
				/>
			</div>
			<OverflowScroller
				ariaLabel="Project health by project"
				className={`-mx-2 px-2 ${tableMeasureClass}`}
				scrollerClassName="space-y-2">
				{projects.length > 0 ? (
					displayedProjects.map((project) => (
						<ProjectHealthRow key={project.id} project={project} />
					))
				) : isError ? (
					<EmptyState
						action={
							<Button className="text-xs" onClick={onRetry} variant="secondary">
								<RefreshCw className="h-3.5 w-3.5" />
								Retry
							</Button>
						}>
						Failed to load project health.
					</EmptyState>
				) : isLoading ? (
					<SkeletonLines count={6} label="Loading project health…" />
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

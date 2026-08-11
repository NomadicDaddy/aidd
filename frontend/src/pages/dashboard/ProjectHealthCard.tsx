import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';
import { Link } from 'react-router';

import type { PortStatusEntry, ProjectSummary } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader, cardHeaderLinkClass } from '../../components/ui/card.tsx';
import { toneText } from '../../lib/tones.ts';
import { ProjectHealthRow } from './ProjectHealthRow.tsx';

export function ProjectHealthCard({
	isError,
	isLoading,
	onRetry,
	portStatus,
	projects,
}: {
	isError: boolean;
	isLoading: boolean;
	onRetry: () => void;
	portStatus: Record<string, PortStatusEntry> | undefined;
	projects: ProjectSummary[];
}) {
	return (
		<Card variant="panel">
			<CardHeader
				action={
					<Link className={cardHeaderLinkClass} to="/projects">
						Projects
						<ArrowRight className="h-3.5 w-3.5" />
					</Link>
				}
				description="Per-project priority health and feature progress."
				icon={<ShieldCheck className={`h-4 w-4 ${toneText.emerald}`} />}
				title="Project Health"
			/>
			{/* The same capped scrollport `FeatureSummaryRows` and `FeatureStatusRows` use, and for
			    the same reason one card away. This card's rows are the tallest on the page, so it
			    was the one that set its grid row's height and left the card beside it as bare
			    background: at 2250 Director Queue ended at y=2455 against this card's y=3165, a
			    973x710px empty column, and the same void appeared at 1920 and 1280. 28rem is not a
			    new number — it is what the other two data cards already cap at.
			    `-mx-2 px-2` so a row's focus ring and hover tint are not shaved by the scrollport's
			    edge, matching FeatureStatusRows.
			    With a ceiling there is no longer a reason to cut the list at six: the cap was
			    standing in for one, and six of thirty-three projects with no marker saying so is
			    the fault the scrollport's own bottom fade now states. */}
			<OverflowScroller
				ariaLabel="Project health by project"
				className="-mx-2 px-2"
				scrollerClassName="max-h-[28rem] space-y-2">
				{projects.length > 0 ? (
					projects.map((project) => (
						<ProjectHealthRow
							key={project.id}
							portStatus={portStatus?.[project.id]}
							project={project}
						/>
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

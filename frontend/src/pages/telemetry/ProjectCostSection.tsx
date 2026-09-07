import type { TelemetryProjectCostRow } from '../../api/types.ts';

import { ErrorState } from '../../components/shared/ErrorState.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { ProjectCostCard } from './ProjectCostCard.tsx';
import { totalProjectCost } from './projectCostPresenter.ts';

/**
 * The Cost by project card and the three states it can be in.
 *
 * A failed request says so in the card rather than rendering as "no projects": this is one request
 * among the page's several, and the summary tiles and charts above it are unaffected by it failing.
 */
export function ProjectCostSection({
	isError,
	isLoading,
	onRetry,
	rows,
}: {
	isError: boolean;
	isLoading: boolean;
	onRetry: () => void;
	rows: TelemetryProjectCostRow[];
}) {
	const total = totalProjectCost(rows);
	const description =
		total === 'Unknown'
			? 'No project cost was reported for the selected invocations.'
			: `Reported spend over the runs these invocations drove · ${total} in the selected filters.`;
	return (
		<section id="project-cost">
			<Card className="@container flex flex-col gap-3">
				<CardHeader
					badge={
						<Badge tone="neutral">
							{rows.length} {rows.length === 1 ? 'project' : 'projects'}
						</Badge>
					}
					className="mb-0"
					description={description}
					title="Cost by project"
				/>
				{isError ? (
					<ErrorState message="Project cost could not be read." onRetry={onRetry} />
				) : isLoading && rows.length === 0 ? (
					<SkeletonLines count={4} label="Loading project cost…" />
				) : (
					<ProjectCostCard rows={rows} />
				)}
			</Card>
		</section>
	);
}

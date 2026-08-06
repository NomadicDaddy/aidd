import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';
import { Link } from 'react-router';

import type { PortStatusEntry, ProjectSummary } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
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
			<div className="space-y-2">
				{projects.length > 0 ? (
					projects
						.slice(0, 6)
						.map((project) => (
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
			</div>
		</Card>
	);
}

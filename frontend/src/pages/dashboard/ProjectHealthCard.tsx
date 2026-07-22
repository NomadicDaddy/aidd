import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';
import { Link } from 'react-router-dom';

import type { PortStatusEntry, ProjectSummary } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
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
			<div className="mb-4 flex items-center justify-between gap-3">
				<div className="flex items-center gap-2 text-sm font-semibold text-neutral-950 dark:text-neutral-50">
					<ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
					Project Health
				</div>
				<Link
					className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-cyan-700 transition-colors outline-none hover:text-cyan-950 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:text-cyan-300 dark:hover:text-cyan-100 dark:focus-visible:ring-offset-slate-950"
					to="/projects">
					Projects
					<ArrowRight className="h-3.5 w-3.5" />
				</Link>
			</div>
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
							<Button className="h-9 text-xs" onClick={onRetry} variant="secondary">
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

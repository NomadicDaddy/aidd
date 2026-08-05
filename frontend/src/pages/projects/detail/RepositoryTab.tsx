import type { ProjectGitStatusSummary, RepositoryInfoState } from '../../../api/types.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../../components/shared/LoadingState.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import {
	useProjectRepositoryInfo,
	useProjectRepositoryRefs,
} from '../../../hooks/useRepositoryInfo.ts';
import { RepositoryInfoCard } from './RepositoryInfoCard.tsx';
import { RepositoryRefsCard } from './RepositoryRefsCard.tsx';
import { WorkingTreeCard } from './workingTree/WorkingTreeCard.tsx';

const STATE_MESSAGE: Record<Exclude<RepositoryInfoState, 'ok'>, string> = {
	error: 'Repository statistics could not be computed. Git may be unavailable or the scan timed out.',
	'not-a-repo':
		'This project directory is not a git repository, so there are no statistics to show.',
	'project-missing': 'The project directory no longer exists on disk.',
};

export function RepositoryTab({
	gitStatus,
	projectId,
}: {
	gitStatus: null | ProjectGitStatusSummary | undefined;
	projectId: string | undefined;
}) {
	const query = useProjectRepositoryInfo(projectId);
	const refsQuery = useProjectRepositoryRefs(projectId);

	return (
		<div className="space-y-4">
			{/* Carded, like every other section header on the tab — this one alone sat on the
			    page background, directly above the carded 'Working tree' header. The measure cap
			    is the Telemetry tab's prose treatment. */}
			<Card>
				<CardHeader
					className="mb-0"
					description={
						<span className="block max-w-prose text-sm">
							A git snapshot of this project — dominant language, branches, tags,
							contributors, and lines of code, derived from git-tracked files only.
						</span>
					}
					title="Repository"
				/>
			</Card>
			<WorkingTreeCard projectId={projectId} status={gitStatus} />
			{query.isLoading ? (
				<Card aria-busy="true">
					<SkeletonLines count={6} label="Computing repository statistics…" />
				</Card>
			) : query.isError ? (
				<EmptyState>
					Repository statistics are temporarily unavailable. Try again in a moment.
				</EmptyState>
			) : query.data && query.data.state === 'ok' && query.data.info ? (
				<RepositoryInfoCard info={query.data.info} />
			) : (
				<EmptyState>
					{query.data
						? STATE_MESSAGE[query.data.state as Exclude<RepositoryInfoState, 'ok'>]
						: 'No repository statistics available.'}
				</EmptyState>
			)}
			{refsQuery.isLoading ? (
				<Card aria-busy="true">
					<SkeletonLines count={4} label="Reading branches, stashes, and worktrees…" />
				</Card>
			) : refsQuery.isError ? null : refsQuery.data &&
			  refsQuery.data.state === 'ok' &&
			  refsQuery.data.refs ? (
				<RepositoryRefsCard
					branches={refsQuery.data.refs.branches}
					stashes={refsQuery.data.refs.stashes}
					worktrees={refsQuery.data.refs.worktrees}
				/>
			) : null}
		</div>
	);
}

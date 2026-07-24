import type { ProjectGitStatusSummary, RepositoryInfoState } from '../../../api/types.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../../components/shared/LoadingState.tsx';
import { Card } from '../../../components/ui/card.tsx';
import {
	useProjectRepositoryInfo,
	useProjectRepositoryRefs,
} from '../../../hooks/useRepositoryInfo.ts';
import { GitStatusBadge } from '../GitStatusBadge.tsx';
import { RepositoryInfoCard } from './RepositoryInfoCard.tsx';
import { RepositoryRefsCard } from './RepositoryRefsCard.tsx';

const STATE_MESSAGE: Record<Exclude<RepositoryInfoState, 'ok'>, string> = {
	error: 'Repository statistics could not be computed. Git may be unavailable or the scan timed out.',
	'not-a-repo':
		'This project directory is not a git repository, so there are no statistics to show.',
	'project-missing': 'The project directory no longer exists on disk.',
};

function WorkingTreePanel({ status }: { status: null | ProjectGitStatusSummary | undefined }) {
	return (
		<Card className="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h3 className="text-foreground text-sm font-semibold">Working tree</h3>
				<p className="text-xs text-neutral-500">
					Porcelain status for staged, unstaged, untracked, and conflicted files.
				</p>
			</div>
			<div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
				<GitStatusBadge className="max-w-[16rem]" status={status} />
				{status && ['clean', 'conflicted', 'dirty'].includes(status.state) ? (
					<span className="tabular-nums">
						{status.staged} staged / {status.unstaged} unstaged / {status.untracked}{' '}
						untracked
					</span>
				) : null}
			</div>
		</Card>
	);
}

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
			<div>
				<h2 className="text-foreground text-sm font-semibold">Repository</h2>
				<p className="text-xs text-neutral-500">
					A git snapshot of this project — dominant language, branches, tags,
					contributors, and lines of code, derived from git-tracked files only.
				</p>
			</div>
			<WorkingTreePanel status={gitStatus} />
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

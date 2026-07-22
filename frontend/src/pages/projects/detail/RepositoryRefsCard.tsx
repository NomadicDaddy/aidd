import type { RepositoryBranch, RepositoryStash, RepositoryWorktree } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';

interface BranchRowProps {
	branch: RepositoryBranch;
}

function BranchRow({ branch }: BranchRowProps) {
	return (
		<li className="flex items-center justify-between gap-3 py-1">
			<div className="flex min-w-0 items-center gap-2">
				{branch.current ? (
					<Badge tone="cyan">current</Badge>
				) : (
					<span
						aria-hidden="true"
						className="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-600"
					/>
				)}
				<code className="truncate text-sm text-neutral-800 dark:text-neutral-100">
					{branch.name}
				</code>
			</div>
			{branch.upstream ? (
				<span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
					{branch.upstream}
				</span>
			) : null}
		</li>
	);
}

function BranchPanel({ branches }: { branches: RepositoryBranch[] }) {
	return (
		<div className="space-y-2">
			<h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
				Branches ({branches.length})
			</h4>
			{branches.length > 0 ? (
				<ul className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
					{branches.map((branch) => (
						<BranchRow branch={branch} key={branch.name} />
					))}
				</ul>
			) : (
				<p className="text-xs text-neutral-400 dark:text-neutral-500">No local branches.</p>
			)}
		</div>
	);
}

function StashPanel({ stashes }: { stashes: RepositoryStash[] }) {
	return (
		<div className="space-y-2">
			<h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
				Stashes ({stashes.length})
			</h4>
			{stashes.length > 0 ? (
				<ul className="space-y-1">
					{stashes.map((stash) => (
						<li
							className="flex items-center justify-between gap-3 text-sm"
							key={`stash-${stash.index}`}>
							<span className="min-w-0 flex-1">
								<code className="text-xs text-neutral-500 dark:text-neutral-400">
									stash@&#123;{stash.index}&#125;
								</code>
								<span className="ml-2 truncate text-neutral-800 dark:text-neutral-100">
									{stash.subject}
								</span>
							</span>
							{stash.sha ? (
								<code className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
									{stash.sha}
								</code>
							) : null}
						</li>
					))}
				</ul>
			) : (
				<p className="text-xs text-neutral-400 dark:text-neutral-500">No stashes.</p>
			)}
		</div>
	);
}

function WorktreePanel({ worktrees }: { worktrees: RepositoryWorktree[] }) {
	return (
		<div className="space-y-2">
			<h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
				Worktrees ({worktrees.length})
			</h4>
			{worktrees.length > 0 ? (
				<ul className="space-y-1">
					{worktrees.map((worktree) => (
						<li
							className="flex items-center justify-between gap-3 text-sm"
							key={worktree.path}>
							<span className="flex min-w-0 flex-1 items-center gap-2">
								{worktree.main ? (
									<Badge tone="neutral">main</Badge>
								) : (
									<span
										aria-hidden="true"
										className="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-600"
									/>
								)}
								<code className="truncate text-xs text-neutral-600 dark:text-neutral-300">
									{worktree.path}
								</code>
							</span>
							<code className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
								{worktree.branch}
							</code>
						</li>
					))}
				</ul>
			) : (
				<p className="text-xs text-neutral-400 dark:text-neutral-500">No worktrees.</p>
			)}
		</div>
	);
}

export function RepositoryRefsCard({
	branches,
	stashes,
	worktrees,
}: {
	branches: RepositoryBranch[];
	stashes: RepositoryStash[];
	worktrees: RepositoryWorktree[];
}) {
	return (
		<Card className="grid grid-cols-1 gap-6 md:grid-cols-3">
			<BranchPanel branches={branches} />
			<StashPanel stashes={stashes} />
			<WorktreePanel worktrees={worktrees} />
		</Card>
	);
}

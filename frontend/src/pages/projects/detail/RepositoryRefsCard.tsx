import type { RepositoryBranch, RepositoryStash, RepositoryWorktree } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';

// Title + count Badge, the presentation the Code and Dependencies tabs already use for a
// collection size — these three were the app's only parenthetical counts, and the Worktrees heading
// was additionally the only one of the three rendered in muted rather than foreground.
// The heading is `subsection` — the second and last step ui/card defines — rather than the
// `text-xs` third step it was. Set at 12px against a card that had no 16px title of its own, these
// three were carrying the whole heading weight of a card at the size of a caption.
function PanelHeading({ count, title }: { count: number; title: string }) {
	return (
		<CardHeader
			badge={<Badge tone="neutral">{count.toLocaleString()}</Badge>}
			className="mb-0"
			headingLevel={4}
			level="subsection"
			title={title}
		/>
	);
}

interface BranchRowProps {
	branch: RepositoryBranch;
}

function BranchRow({ branch }: BranchRowProps) {
	return (
		<li className="flex items-center justify-between gap-3 py-1">
			<div className="flex min-w-0 items-center gap-2">
				{branch.current ? (
					<Badge tone="neutral">current</Badge>
				) : (
					<span
						aria-hidden="true"
						className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground"
					/>
				)}
				<code className="truncate font-mono text-sm text-foreground">{branch.name}</code>
			</div>
			{branch.upstream ? (
				<span className="shrink-0 font-mono text-xs text-muted-foreground">
					{branch.upstream}
				</span>
			) : null}
		</li>
	);
}

function BranchPanel({ branches }: { branches: RepositoryBranch[] }) {
	return (
		<div className="space-y-2">
			<PanelHeading count={branches.length} title="Branches" />
			{branches.length > 0 ? (
				<ul className="divide-y divide-border">
					{branches.map((branch) => (
						<BranchRow branch={branch} key={branch.name} />
					))}
				</ul>
			) : (
				<p className="text-xs text-muted-foreground">No local branches.</p>
			)}
		</div>
	);
}

function StashPanel({ stashes }: { stashes: RepositoryStash[] }) {
	return (
		<div className="space-y-2">
			<PanelHeading count={stashes.length} title="Stashes" />
			{stashes.length > 0 ? (
				<ul className="space-y-1">
					{stashes.map((stash) => (
						<li
							className="flex items-center justify-between gap-3 text-sm"
							key={`stash-${stash.index}`}>
							<span className="min-w-0 flex-1">
								<code className="font-mono text-xs text-muted-foreground">
									stash@&#123;{stash.index}&#125;
								</code>
								<span className="ml-2 truncate text-foreground">
									{stash.subject}
								</span>
							</span>
							{stash.sha ? (
								<code className="shrink-0 font-mono text-xs text-muted-foreground">
									{stash.sha}
								</code>
							) : null}
						</li>
					))}
				</ul>
			) : (
				<p className="text-xs text-muted-foreground">No stashes.</p>
			)}
		</div>
	);
}

function WorktreePanel({ worktrees }: { worktrees: RepositoryWorktree[] }) {
	return (
		<div className="space-y-2">
			<PanelHeading count={worktrees.length} title="Worktrees" />
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
										className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground"
									/>
								)}
								<code className="truncate font-mono text-xs text-muted-foreground">
									{worktree.path}
								</code>
							</span>
							<code className="shrink-0 font-mono text-xs text-muted-foreground">
								{worktree.branch}
							</code>
						</li>
					))}
				</ul>
			) : (
				<p className="text-xs text-muted-foreground">No worktrees.</p>
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
		<Card>
			<CardHeader
				description="Local branches, stashes, and linked worktrees for this repository."
				headingLevel={3}
				title="Refs"
			/>
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
				<BranchPanel branches={branches} />
				<StashPanel stashes={stashes} />
				<WorktreePanel worktrees={worktrees} />
			</div>
		</Card>
	);
}

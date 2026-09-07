import type { RepositoryBranch, RepositoryStash, RepositoryWorktree } from '../../../api/types.ts';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { FilePath } from '../../../components/shared/FilePath.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { tableColumnClass } from '../../../lib/tableStyles.ts';
import { RepositoryPanelHeading } from './RepositoryPanelHeading.tsx';

// Title + count Badge, the presentation the Code and Dependencies tabs already use for a
// collection size — these three were the app's only parenthetical counts, and the Worktrees heading
// was additionally the only one of the three rendered in muted rather than foreground.
// The heading is `subsection` — the second and last step ui/card defines — rather than the
// `text-xs` third step it was. Set at 12px against a card that had no 16px title of its own, these
// three were carrying the whole heading weight of a card at the size of a caption. Both Repository
// cards now route this heading rank through RepositoryPanelHeading.

interface BranchRowProps {
	branch: RepositoryBranch;
}

function BranchRow({ branch }: BranchRowProps) {
	return (
		<li className="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)_minmax(7rem,auto)] items-center gap-2 py-1">
			{branch.current ? (
				<Badge casing="title" tone="neutral">
					current
				</Badge>
			) : (
				<span
					aria-hidden="true"
					className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground"
				/>
			)}
			<code
				className="min-w-0 truncate font-mono text-sm text-foreground"
				title={branch.name}>
				{branch.name}
			</code>
			<span
				className="min-w-0 truncate font-mono text-xs text-muted-foreground"
				title={branch.upstream ?? 'No upstream branch'}>
				{branch.upstream ?? 'no upstream'}
			</span>
		</li>
	);
}

function BranchPanel({
	branches,
	remoteBranchCount,
}: {
	branches: RepositoryBranch[];
	remoteBranchCount?: number | undefined;
}) {
	return (
		<div className="space-y-2">
			<RepositoryPanelHeading
				count={branches.length}
				description={remoteBranchCount === 0 ? 'No remote branches configured.' : undefined}
				title="Branches"
			/>
			{branches.length > 0 ? (
				<ul className="divide-y divide-border">
					{branches.map((branch) => (
						<BranchRow branch={branch} key={branch.name} />
					))}
				</ul>
			) : (
				<EmptyState className="p-3 text-xs">No local branches.</EmptyState>
			)}
		</div>
	);
}

function TagPanel({ tags, totalTagCount }: { tags: string[]; totalTagCount?: number | undefined }) {
	// The count is the repository's real tag total (the Snapshot block above shows the same number),
	// not the length of this list: the backend caps the list, and a badge reading 50 beside a
	// Snapshot reading 312 would be two different answers to one question on one page.
	const total = totalTagCount ?? tags.length;
	return (
		<div className="space-y-2">
			<RepositoryPanelHeading
				count={total}
				description={
					total > tags.length ? `Showing the ${tags.length} most recent.` : undefined
				}
				title="Tags"
			/>
			{tags.length > 0 ? (
				<ul className="flex flex-wrap gap-2 @min-[61rem]:block @min-[61rem]:divide-y @min-[61rem]:divide-border">
					{tags.map((tag) => (
						<li
							className="flex min-w-0 items-center gap-2 rounded-md bg-muted px-2 py-1 @min-[61rem]:rounded-none @min-[61rem]:bg-transparent @min-[61rem]:px-0"
							key={tag}>
							<span
								aria-hidden="true"
								className="hidden h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground @min-[61rem]:block"
							/>
							<code
								className="min-w-0 truncate font-mono text-sm text-foreground"
								title={tag}>
								{tag}
							</code>
						</li>
					))}
				</ul>
			) : (
				<EmptyState className="p-3 text-xs">No tags.</EmptyState>
			)}
		</div>
	);
}

function StashPanel({ stashes }: { stashes: RepositoryStash[] }) {
	return (
		<div className="space-y-2">
			<RepositoryPanelHeading count={stashes.length} title="Stashes" />
			{stashes.length > 0 ? (
				<ul className="divide-y divide-border">
					{stashes.map((stash) => (
						<li
							className="flex min-w-0 items-center gap-2 py-1 text-sm"
							key={`stash-${stash.index}`}>
							<code className="shrink-0 font-mono text-sm text-foreground">
								stash@&#123;{stash.index}&#125;
							</code>
							<span
								className="min-w-0 truncate text-xs text-muted-foreground"
								title={stash.subject}>
								{stash.subject}
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
				<EmptyState className="p-3 text-xs">No stashes.</EmptyState>
			)}
		</div>
	);
}

function WorktreePanel({ worktrees }: { worktrees: RepositoryWorktree[] }) {
	return (
		<div className="space-y-2">
			<RepositoryPanelHeading count={worktrees.length} title="Worktrees" />
			{worktrees.length > 0 ? (
				<ul className="divide-y divide-border">
					{worktrees.map((worktree) => (
						<li
							className="flex min-w-0 items-center gap-2 py-1 text-sm"
							key={worktree.path}>
							{worktree.main ? (
								<Badge tone="neutral">main</Badge>
							) : (
								<span
									aria-hidden="true"
									className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground"
								/>
							)}
							<code className="min-w-0 truncate font-mono text-sm text-foreground">
								{worktree.branch}
							</code>
							<FilePath
								className="min-w-0 truncate text-xs text-muted-foreground"
								path={worktree.path}
							/>
						</li>
					))}
				</ul>
			) : (
				<EmptyState className="p-3 text-xs">No worktrees.</EmptyState>
			)}
		</div>
	);
}

export function RepositoryRefsCard({
	branches,
	remoteBranchCount,
	stashes,
	tags,
	totalTagCount,
	worktrees,
}: {
	branches: RepositoryBranch[];
	remoteBranchCount?: number | undefined;
	stashes: RepositoryStash[];
	tags: string[];
	totalTagCount?: number | undefined;
	worktrees: RepositoryWorktree[];
}) {
	return (
		<Card className={`@container ${tableColumnClass}`}>
			<CardHeader
				description="Local branches, tags, stashes, and linked worktrees for this repository."
				headingLevel={3}
				title="Refs"
			/>
			<div className="grid grid-cols-1 items-start gap-6 @min-[61rem]:grid-cols-2 @min-[80rem]:grid-cols-4">
				<BranchPanel branches={branches} remoteBranchCount={remoteBranchCount} />
				<TagPanel tags={tags} totalTagCount={totalTagCount} />
				<StashPanel stashes={stashes} />
				<WorktreePanel worktrees={worktrees} />
			</div>
		</Card>
	);
}

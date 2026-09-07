import { default as GitCommit } from 'lucide-react/dist/esm/icons/git-commit';

import type { GitCommitRef } from '../../api/types.ts';

import { shortCommitHash } from '../../lib/commitFormat.ts';
import { Tooltip } from '../ui/tooltip.tsx';

/** Row of commit buttons (short sha + subject); clicking one opens the diff viewer. */
export function CommitChips({
	commits,
	onSelect,
}: {
	commits: GitCommitRef[];
	onSelect: (commit: GitCommitRef) => void;
}) {
	if (commits.length === 0) return null;
	return (
		<div className="flex flex-wrap gap-1.5">
			{commits.map((commit) => (
				<Tooltip content={`${commit.subject} · ${commit.hash}`} key={commit.hash}>
					<button
						className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-left text-xs text-foreground transition-colors hover:border-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:min-h-11"
						onClick={() => onSelect(commit)}
						type="button">
						<GitCommit
							aria-hidden="true"
							className="h-3.5 w-3.5 shrink-0 text-accent"
						/>
						<span className="shrink-0 font-mono text-muted-foreground">
							{shortCommitHash(commit.hash)}
						</span>
						<span className="min-w-0 text-left whitespace-normal sm:truncate">
							{commit.subject}
						</span>
					</button>
				</Tooltip>
			))}
		</div>
	);
}

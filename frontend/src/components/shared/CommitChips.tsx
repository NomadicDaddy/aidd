import { default as GitCommit } from 'lucide-react/dist/esm/icons/git-commit';

import type { GitCommitRef } from '../../api/types.ts';

import { shortCommitHash } from '../../lib/commitFormat.ts';

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
				<button
					className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-1 text-left text-xs text-neutral-700 transition-colors hover:border-teal-400 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:outline-none dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:border-teal-500 dark:hover:text-neutral-50"
					key={commit.hash}
					onClick={() => onSelect(commit)}
					title={`View changes for ${commit.hash}`}
					type="button">
					<GitCommit
						aria-hidden="true"
						className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400"
					/>
					<span className="shrink-0 font-mono text-neutral-500 dark:text-neutral-400">
						{shortCommitHash(commit.hash)}
					</span>
					<span className="truncate">{commit.subject}</span>
				</button>
			))}
		</div>
	);
}

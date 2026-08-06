import { default as FileEdit } from 'lucide-react/dist/esm/icons/file-pen';
import { default as FilePlus } from 'lucide-react/dist/esm/icons/file-plus';
import { default as GitCommit } from 'lucide-react/dist/esm/icons/git-commit';
import { useState } from 'react';

import type { GitCommitRef, RunLaunchCommand, RunRecord } from '../../api/types.ts';

import { CommitChips } from '../../components/shared/CommitChips.tsx';
import { CommitDiffDialog } from '../../components/shared/CommitDiffDialog.tsx';
import { RunCommandInfo } from '../../components/shared/RunCommandInfo.tsx';
import { useRunCommits } from '../../hooks/useCommits.ts';
import { cn } from '../../lib/cn.ts';
import { fieldLabelClass } from '../../lib/formStyles.ts';
import { toneBorder, toneSurface, toneText } from '../../lib/tones.ts';
import { FileChangeChip } from './RunFileChangeChip.tsx';
import { isReadOnlySkillDirectiveViolation } from './skillDirectiveIntent.ts';

// One surface step below the sunken panel around it, so command text and the stop transcript read
// as recessed content rather than as a third ad-hoc fill.
export const detailPreClass =
	'overflow-auto rounded-md border border-border bg-background p-2 text-xs whitespace-pre-wrap text-foreground';

export function MetadataItem({
	className,
	label,
	value,
}: {
	className?: string;
	label: string;
	value: string;
}) {
	return (
		<div className={cn('flex min-w-0 flex-col', className)}>
			<dt className={fieldLabelClass}>{label}</dt>
			<dd className="min-w-0 text-xs break-words text-foreground">{value}</dd>
		</div>
	);
}

export function ReadOnlyContractViolation() {
	return (
		<div
			className={cn(
				'rounded-md border p-2 text-xs',
				toneBorder.red,
				toneSurface.red,
				toneText.red,
			)}>
			<strong>Read-only contract violation.</strong> This skill directive was instructed not
			to modify the project, but its run evidence includes file changes or commits. aidd
			preserved the evidence and did not automatically revert any work.
		</div>
	);
}

/**
 * The command that launched a run, with its provenance popover.
 *
 * Shared because the pipeline report needs it as badly as the Live Console does: a step card that
 * shows only its raw transcript cannot answer "what was actually run", which is the first thing
 * anyone reading a failed step wants.
 */
export function RunCommandBlock({
	command,
	runId,
}: {
	command: null | RunLaunchCommand | undefined;
	runId: string;
}) {
	return (
		<div>
			<div className={`mb-1 flex items-center gap-1.5 ${fieldLabelClass}`}>
				Command
				<RunCommandInfo command={command ?? null} runId={runId} />
			</div>
			<pre className={`max-h-28 font-mono ${detailPreClass}`}>
				{command?.display ?? 'Unavailable'}
			</pre>
		</div>
	);
}

/**
 * File-change chips, attributed commits and the read-only contract violation for one run.
 *
 * Renders nothing at all when the run produced no evidence, so a caller can drop it in
 * unconditionally.
 */
export function RunCommitsSection({ run }: { run: RunRecord }) {
	const query = useRunCommits(run.id);
	const [selectedCommit, setSelectedCommit] = useState<GitCommitRef | null>(null);
	const data = query.data;
	// 'ledger-missing' means the project has no run history on disk at all (e.g. deleted
	// project dir) — showing a "no commits" row there would just be noise.
	if (!data || data.state === 'ledger-missing' || data.state === 'run-not-found') return null;

	const hasCommits = data.state === 'ok' && data.commits.length > 0;
	// When the ledger says commits were created (totals.commitsCreated > 0) but no commit refs
	// are present in the attributed list, it means the run's commits touched feature directories
	// outside the run's attributed set (directive/role/audit modes) and were filtered — not that
	// no commits were made. Surface the count so the operator sees the run did produce commits.
	const unattributedCount =
		data.commitsCreatedCount > 0 && data.commits.length === 0 ? data.commitsCreatedCount : 0;
	const hasFileChanges = data.filesCreated > 0 || data.filesEdited > 0;
	const readOnlyViolation = isReadOnlySkillDirectiveViolation(run, data);

	// Skip the entire section if there's nothing to show.
	if (!hasCommits && !unattributedCount && !hasFileChanges && data.state === 'ok') {
		return null;
	}

	return (
		<div className="space-y-2">
			{readOnlyViolation ? <ReadOnlyContractViolation /> : null}
			{(hasFileChanges || unattributedCount > 0) && (
				<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					{data.filesCreated > 0 ? (
						<FileChangeChip
							kind="created"
							paths={data.fileChanges.created}
							source={data.fileChanges.source}
							truncated={data.fileChanges.truncated}>
							<FilePlus
								aria-hidden="true"
								className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
							/>
							{data.filesCreated} {data.filesCreated === 1 ? 'file' : 'files'} created
						</FileChangeChip>
					) : null}
					{data.filesEdited > 0 ? (
						<FileChangeChip
							kind="edited"
							paths={data.fileChanges.edited}
							source={data.fileChanges.source}
							truncated={data.fileChanges.truncated}>
							<FileEdit
								aria-hidden="true"
								className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400"
							/>
							{data.filesEdited} {data.filesEdited === 1 ? 'file' : 'files'} edited
						</FileChangeChip>
					) : null}
					{unattributedCount > 0 ? (
						<span className="inline-flex items-center gap-1">
							<GitCommit
								aria-hidden="true"
								className="h-3.5 w-3.5 text-muted-foreground"
							/>
							{unattributedCount} {unattributedCount === 1 ? 'commit' : 'commits'}
						</span>
					) : null}
				</div>
			)}
			{hasCommits ? (
				<div>
					<div className={`mb-1 ${fieldLabelClass}`}>Commits</div>
					<CommitChips commits={data.commits} onSelect={setSelectedCommit} />
				</div>
			) : null}
			{selectedCommit ? (
				<CommitDiffDialog
					commit={selectedCommit}
					onClose={() => setSelectedCommit(null)}
					projectId={run.projectId}
				/>
			) : null}
		</div>
	);
}

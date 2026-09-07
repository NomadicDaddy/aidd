import { useState } from 'react';
import { toast } from 'sonner';

import type { ProjectGitStatusSummary } from '../../../../api/types.ts';
import type { WorkingTreeCommand } from '../../../../hooks/useWorkingTree.ts';

import { ConfirmDialog } from '../../../../components/shared/ConfirmDialog.tsx';
import { EmptyState } from '../../../../components/shared/EmptyState.tsx';
import { SkeletonLines } from '../../../../components/shared/LoadingState.tsx';
import { Button } from '../../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../../components/ui/card.tsx';
import { useProjectWorkingTree, useWorkingTreeCommand } from '../../../../hooks/useWorkingTree.ts';
import { tableColumnClass } from '../../../../lib/tableStyles.ts';
import { CommitMessageDialog } from './CommitMessageDialog.tsx';
import { describeDiscard, STATE_MESSAGE } from './workingTreeCopy.ts';
import { WorkingTreeList } from './WorkingTreeList.tsx';
import { countSelection, maxSelectedPaths } from './workingTreeStatus.ts';
import { WorkingTreeTable } from './WorkingTreeTable.tsx';
import { WorkingTreeToolbar } from './WorkingTreeToolbar.tsx';

type OpenDialog = 'commit-selected' | 'commit-staged' | 'discard' | null;

const mobileFileBatchSize = 25;

export function WorkingTreeCard({
	projectId,
	status,
}: {
	projectId: string | undefined;
	status: null | ProjectGitStatusSummary | undefined;
}) {
	const query = useProjectWorkingTree(projectId);
	const command = useWorkingTreeCommand(projectId);
	const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
	const [dialog, setDialog] = useState<OpenDialog>(null);
	const [visibleMobileCount, setVisibleMobileCount] = useState(mobileFileBatchSize);

	const files = query.data?.state === 'ok' ? query.data.files : [];
	// Derive the live selection from the current listing rather than pruning `checked` in an
	// effect: committing or discarding removes rows, and a stale path would otherwise be re-sent
	// on the next action and rejected by the server.
	const selectedFiles = files.filter((file) => checked.has(file.path));
	const selectedPaths = selectedFiles.map((file) => file.path);
	const selection = countSelection(selectedFiles);
	const stagedCount = files.filter((file) => file.staged).length;
	const statusSummary = status
		? [
				status.branch,
				status.ahead > 0 ? `ahead ${status.ahead}` : null,
				status.behind > 0 ? `behind ${status.behind}` : null,
				status.conflicted > 0 ? `${status.conflicted} conflicted` : null,
				`${status.staged} staged`,
				`${status.unstaged} unstaged`,
				`${status.untracked} untracked`,
			].filter((part): part is string => part !== null)
		: [];

	// The server rejects any action naming more than maxSelectedPaths files, so the selection is
	// capped here instead: offering a button that is guaranteed to fail is worse than saying why.
	function warnAtLimit() {
		toast.warning(`You can act on ${maxSelectedPaths} files at a time — work in batches.`);
	}

	function toggleFile(path: string) {
		if (!checked.has(path) && checked.size >= maxSelectedPaths) {
			warnAtLimit();
			return;
		}
		setChecked((current) => {
			const next = new Set(current);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}

	function toggleAll() {
		if (files.length > 0 && files.every((file) => checked.has(file.path))) {
			setChecked(new Set());
			return;
		}
		if (files.length > maxSelectedPaths) warnAtLimit();
		setChecked(new Set(files.slice(0, maxSelectedPaths).map((file) => file.path)));
	}

	function run(next: WorkingTreeCommand, success: string) {
		command.mutate(next, {
			onError: (error) => toast.error(error instanceof Error ? error.message : 'Git failed'),
			onSettled: () => setDialog(null),
			// The route answers 200 with `ok: false` when git itself refused (a pre-commit hook, an
			// unconfigured user.email, a partial commit during a merge) — that is not a transport
			// error, but the user still has to see it.
			onSuccess: (result) => {
				if (result.ok) {
					setChecked(new Set());
					toast.success(success);
				} else {
					toast.error(result.reason ?? 'Git refused the operation');
				}
			},
		});
	}

	const plural = (count: number) => `${count} file${count === 1 ? '' : 's'}`;

	// The section header lives inside the Card it labels — a Card of its own directly above this
	// one would be the same header idiom split across two surfaces.
	const header = (
		<CardHeader
			action={
				status && ['clean', 'conflicted', 'dirty'].includes(status.state) ? (
					<span className="flex flex-wrap justify-start gap-x-1 text-xs text-muted-foreground tabular-nums sm:justify-end">
						{statusSummary.map((part, index) => (
							<span className="whitespace-nowrap" key={part}>
								{index > 0 ? '· ' : ''}
								{part}
							</span>
						))}
					</span>
				) : null
			}
			className="mb-0 border-b border-border p-4"
			description="Stage, discard, and commit the files this project has changed since its last commit."
			headingLevel={3}
			title="Working tree"
		/>
	);

	if (query.isLoading) {
		return (
			<Card className={`@container p-0 ${tableColumnClass}`}>
				{header}
				<div aria-busy="true" className="p-4">
					<SkeletonLines count={4} label="Reading changed files…" />
				</div>
			</Card>
		);
	}
	if (query.isError || !query.data || query.data.state !== 'ok') {
		return (
			<Card className={`@container p-0 ${tableColumnClass}`}>
				{header}
				<div className="p-4">
					<EmptyState>
						{query.isError
							? 'Changed files are temporarily unavailable. Try again in a moment.'
							: query.data
								? STATE_MESSAGE[query.data.state]
								: STATE_MESSAGE.error}
					</EmptyState>
				</div>
			</Card>
		);
	}
	if (files.length === 0) {
		return (
			<Card className={`@container p-0 ${tableColumnClass}`}>
				{header}
				<EmptyState className="m-4">Nothing to stage, discard, or commit.</EmptyState>
			</Card>
		);
	}

	return (
		<>
			<Card className={`@container p-0 ${tableColumnClass}`}>
				{header}
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
					<p className="text-xs text-muted-foreground">
						{`${selectedPaths.length} selected`}
						{query.data.truncated ? ' · listing truncated at the server limit' : ''}
					</p>
					<WorkingTreeToolbar
						onCommitSelected={() => setDialog('commit-selected')}
						onCommitStaged={() => setDialog('commit-staged')}
						onDiscard={() => setDialog('discard')}
						onReset={() => run({ kind: 'reset' }, 'Unstaged everything')}
						onStage={() =>
							run(
								{ kind: 'stage', paths: selectedPaths },
								`Staged ${plural(selectedPaths.length)}`,
							)
						}
						onUnstage={() =>
							run(
								{ kind: 'unstage', paths: selectedPaths },
								`Unstaged ${plural(selectedPaths.length)}`,
							)
						}
						pending={command.isPending}
						selectedCount={selectedPaths.length}
						selectedStaged={selection.staged}
						selectedUnstaged={selection.unstaged}
						stagedCount={stagedCount}
					/>
				</div>
				<div className="hidden @min-[48rem]:block">
					<WorkingTreeTable
						disabled={command.isPending}
						files={files}
						onToggleAll={toggleAll}
						onToggleFile={toggleFile}
						selected={checked}
					/>
				</div>
				<div className="p-3 @min-[48rem]:hidden">
					<WorkingTreeList
						disabled={command.isPending}
						files={files.slice(0, visibleMobileCount)}
						onToggleFile={toggleFile}
						selected={checked}
					/>
					{visibleMobileCount < files.length ? (
						<div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
							<p className="text-xs text-muted-foreground tabular-nums">
								Showing {visibleMobileCount.toLocaleString()} of{' '}
								{files.length.toLocaleString()} files
							</p>
							<Button
								onClick={() =>
									setVisibleMobileCount((count) =>
										Math.min(count + mobileFileBatchSize, files.length),
									)
								}
								size="compact"
								variant="ghost">
								Show{' '}
								{Math.min(mobileFileBatchSize, files.length - visibleMobileCount)}{' '}
								more
							</Button>
						</div>
					) : null}
				</div>
			</Card>
			<ConfirmDialog
				confirmLabel="Discard changes"
				description={describeDiscard(selectedFiles)}
				destructive
				isPending={command.isPending}
				onClose={() => setDialog(null)}
				onConfirm={() =>
					run(
						{ kind: 'discard', paths: selectedPaths },
						`Discarded changes to ${plural(selectedPaths.length)}`,
					)
				}
				open={dialog === 'discard'}
				title={`Discard changes to ${plural(selectedPaths.length)}?`}
			/>
			<CommitMessageDialog
				description={`Stages and commits exactly the ${plural(selectedPaths.length)} you selected. Anything else already staged stays staged.`}
				isPending={command.isPending}
				onClose={() => setDialog(null)}
				onSubmit={(message) =>
					run(
						{ kind: 'commit', message, paths: selectedPaths },
						`Committed ${plural(selectedPaths.length)}`,
					)
				}
				open={dialog === 'commit-selected'}
				title="Commit selected files"
			/>
			<CommitMessageDialog
				description={`Commits the ${plural(stagedCount)} currently staged. Unstaged edits stay in the working tree.`}
				isPending={command.isPending}
				onClose={() => setDialog(null)}
				onSubmit={(message) =>
					run({ kind: 'commit-staged', message }, `Committed ${plural(stagedCount)}`)
				}
				open={dialog === 'commit-staged'}
				title="Commit staged files"
			/>
		</>
	);
}

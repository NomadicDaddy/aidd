import { Button } from '../../../../components/ui/button.tsx';

// Actions split by what they operate on: the four left-hand buttons act on the current selection,
// the two right-hand ones act on the index as a whole. `Commit staged` and `Reset` therefore stay
// enabled with nothing selected, and disable when nothing is staged.
export function WorkingTreeToolbar({
	onCommitSelected,
	onCommitStaged,
	onDiscard,
	onReset,
	onStage,
	onUnstage,
	pending,
	selectedCount,
	selectedStaged,
	selectedUnstaged,
	stagedCount,
}: {
	onCommitSelected: () => void;
	onCommitStaged: () => void;
	onDiscard: () => void;
	onReset: () => void;
	onStage: () => void;
	onUnstage: () => void;
	pending: boolean;
	selectedCount: number;
	selectedStaged: number;
	selectedUnstaged: number;
	stagedCount: number;
}) {
	const noSelection = pending || selectedCount === 0;
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button
				disabled={noSelection || selectedUnstaged === 0}
				onClick={onStage}
				size="compact"
				title={
					selectedUnstaged === 0 && selectedCount > 0
						? 'Every selected file is already staged.'
						: 'Stage the selected files (git add).'
				}>
				Stage
			</Button>
			<Button
				disabled={noSelection || selectedStaged === 0}
				onClick={onUnstage}
				size="compact"
				title={
					selectedStaged === 0 && selectedCount > 0
						? 'None of the selected files are staged.'
						: 'Unstage the selected files, keeping the edits (git reset).'
				}>
				Unstage
			</Button>
			<Button
				disabled={noSelection}
				onClick={onCommitSelected}
				size="compact"
				title="Stage and commit exactly the selected files."
				variant="primary">
				Commit selected
			</Button>
			<Button
				disabled={noSelection}
				onClick={onDiscard}
				size="compact"
				title="Throw away every change to the selected files."
				variant="danger">
				Discard
			</Button>
			<span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-border sm:block" />
			<Button
				disabled={pending || stagedCount === 0}
				onClick={onCommitStaged}
				size="compact"
				title={
					stagedCount === 0
						? 'Nothing is staged.'
						: `Commit the ${stagedCount} staged file${stagedCount === 1 ? '' : 's'}.`
				}>
				Commit staged
			</Button>
			<Button
				disabled={pending || stagedCount === 0}
				onClick={onReset}
				size="compact"
				title={
					stagedCount === 0
						? 'Nothing is staged.'
						: 'Unstage everything, keeping all edits in the working tree (git reset).'
				}>
				Reset
			</Button>
		</div>
	);
}

import { projectNotesMaxLength } from 'aidd-shared/contracts/project-notes';
import { useId, useState } from 'react';
import { toast } from 'sonner';

import { CommitBar, commitBarClearanceClass } from '../../../components/shared/CommitBar.tsx';
import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { LoadingState } from '../../../components/shared/LoadingState.tsx';
import { MarkdownContent } from '../../../components/shared/MarkdownContent.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useProjectNotes, useSaveProjectNotes } from '../../../hooks/useProjectNotes.ts';
import { useViewportFill } from '../../../hooks/useViewportFill.ts';
import { cn } from '../../../lib/cn.ts';
import { formatCount, formatDate } from '../../../lib/formatters.ts';
import { monoTextareaClass } from '../../../lib/formStyles.ts';
import { proseMeasureClass, sectionCaptionClass } from '../../../lib/typography.ts';
import { projectDetailViewportGutterPx } from './projectDetailViewport.ts';

function formatSavedAt(updatedAt: null | number, hasContent: boolean): string {
	if (updatedAt === null) return hasContent ? 'Not saved yet' : 'No notes yet';
	return `Last saved ${formatDate(updatedAt)}`;
}

export function NotesTab({ projectId }: { projectId: string }) {
	const notes = useProjectNotes(projectId);
	const saveNotes = useSaveProjectNotes(projectId);
	const [draft, setDraft] = useState('');
	const lengthHelpId = useId();
	// Seed the editor once the pad loads, and re-sync whenever a save (or refetch) advances the
	// server content so the dirty indicator reflects the persisted state. Adjusting state during
	// render (guarded by the last-synced value) is React's sanctioned alternative to a setState
	// effect here — https://react.dev/learn/you-might-not-need-an-effect.
	const serverContent = notes.data?.content;
	const editorRef = useViewportFill<HTMLTextAreaElement>({
		gutterPx: projectDetailViewportGutterPx,
		refreshKey: notes.data,
	});
	const [syncedContent, setSyncedContent] = useState<string | undefined>(undefined);
	if (serverContent !== undefined && serverContent !== syncedContent) {
		setSyncedContent(serverContent);
		setDraft(serverContent);
	}

	if (notes.isLoading) {
		return <LoadingState message="Loading notes…" />;
	}
	if (notes.isError || !notes.data) {
		return <ErrorState message="Could not load this project's notes." />;
	}

	const dirty = draft !== notes.data.content;
	const draftLength = draft.length;
	const overLimit = draftLength > projectNotesMaxLength;
	const nearLimit = draftLength >= projectNotesMaxLength * 0.9;
	const lengthMessage = overLimit
		? `${formatCount(draftLength)} characters — ${formatCount(draftLength - projectNotesMaxLength)} over the ${formatCount(projectNotesMaxLength)} character limit.`
		: `${formatCount(draftLength)} of ${formatCount(projectNotesMaxLength)} characters.`;
	const savedAt = formatSavedAt(notes.data.updatedAt, draft.trim().length > 0);
	const save = () => {
		if (!dirty || saveNotes.isPending) return;
		if (overLimit) {
			toast.error(
				`Notes are ${formatCount(draftLength)} characters; the limit is ${formatCount(projectNotesMaxLength)}.`,
			);
			return;
		}
		saveNotes.mutate(draft, {
			onError: () => {
				toast.error('Could not save notes. Try again.');
			},
			onSuccess: () => {
				toast.success('Notes saved');
			},
		});
	};

	return (
		<div className={cn('flex flex-col gap-4', commitBarClearanceClass)}>
			<Card className="@container flex flex-col gap-3">
				<CardHeader
					action={
						// Same wrap as the interview header. `CardHeader` puts this opposite the title while
						// they fit on one row; below `sm` they do not, and the timestamp, the counter and
						// Save then landed on their own rows at three arbitrary left edges, Save 242px out
						// over an empty 324px card. Left-aligned they share the title's rail. Above `sm`
						// the header is the two-column row it was.
						<div className="hidden flex-wrap items-center justify-end gap-2 sm:flex">
							<Button
								disabled={!dirty || saveNotes.isPending}
								onClick={() => setDraft(notes.data.content)}
								variant="secondary">
								Discard
							</Button>
							<Button
								disabled={!dirty || saveNotes.isPending || overLimit}
								onClick={save}
								title="Save notes (Ctrl/Cmd+S)"
								variant="primary">
								{saveNotes.isPending ? 'Saving…' : 'Save'}
							</Button>
							{overLimit ? (
								<span
									className="text-destructive basis-full text-right text-xs"
									role="status">
									{lengthMessage}
								</span>
							) : null}
						</div>
					}
					className="mb-0"
					description={
						<>
							A free-form, persistent markdown scratch pad{' '}
							<span className="whitespace-nowrap">
								saved to <code>.aidd/notes.md</code>.
							</span>
						</>
					}
					status={<span className="text-xs text-muted-foreground">{savedAt}</span>}
					title="Notes"
				/>
				{/* The editor grows with the window in the wide preview layout, on the same principle as
			    the code browser: a fixed 28rem left this pad 448px tall inside a 1309px viewport, so the one
			    surface on the page whose whole purpose is a long block of text was the one showing
			    the least of it, with 500px of empty card and empty page below it. The stacked layout
			    uses a 22rem editor so its preview still enters a 900px-high desktop viewport.

			    `useViewportFill` measures the editor's real top edge, including however much room the
			    wrapped header action and description actually use, then leaves the Card's bottom
			    gutter beneath it. */}
				{/* This is intentionally a full-rail tab: once the card reaches 80rem, the editor keeps
			    its declared code measure and the remaining rail becomes a rendered preview. */}
				<div className="grid min-w-0 gap-5 text-sm @min-[64rem]:grid-cols-[minmax(0,1fr)_minmax(20rem,1fr)] @min-[80rem]:grid-cols-[minmax(0,100ch)_minmax(0,1fr)]">
					<section aria-label="Notes editor" className="min-w-0 font-mono">
						<p className={sectionCaptionClass}>Editor</p>
						<textarea
							aria-describedby={lengthHelpId}
							aria-invalid={overLimit || undefined}
							aria-keyshortcuts="Control+S Meta+S"
							aria-label="Project notes"
							className={`${monoTextareaClass} min-h-[28rem] !max-w-none font-mono @min-[80rem]:h-[var(--fill-height)] @min-[80rem]:min-h-0 @min-[80rem]:resize-none`}
							onChange={(event) => setDraft(event.target.value)}
							onKeyDown={(event) => {
								if ((event.metaKey || event.ctrlKey) && event.key === 's') {
									event.preventDefault();
									save();
								}
							}}
							placeholder="Jot down anything about this project — it persists in .aidd/notes.md."
							ref={editorRef}
							value={draft}
						/>
						<p
							className={cn(
								'mt-2 text-xs tabular-nums',
								overLimit ? 'text-destructive' : 'text-muted-foreground',
								!nearLimit && 'sr-only',
							)}
							id={lengthHelpId}
							role={overLimit ? 'alert' : undefined}>
							{lengthMessage}
						</p>
					</section>
					<section
						aria-label="Rendered notes preview"
						className="min-w-0 rounded-lg border border-border bg-muted/40 p-3 font-sans">
						<p className={sectionCaptionClass}>Preview</p>
						{draft.trim() ? (
							<MarkdownContent
								baseLevel={3}
								className="mt-3"
								markdown={draft}
								measure="prose"
							/>
						) : (
							<EmptyState className={`mt-3 ${proseMeasureClass}`}>
								The rendered markdown preview will appear here.
							</EmptyState>
						)}
					</section>
				</div>
			</Card>
			<CommitBar
				blockReason={overLimit ? lengthMessage : null}
				className="sm:hidden"
				dirty={dirty}
				dirtyLabel={lengthMessage}
				onDiscard={() => setDraft(notes.data.content)}
				onSave={save}
				pending={saveNotes.isPending}
				saveLabel="Save Notes"
			/>
		</div>
	);
}

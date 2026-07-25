import { default as NotebookPen } from 'lucide-react/dist/esm/icons/notebook-pen';
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { useState } from 'react';
import { toast } from 'sonner';

import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { LoadingState } from '../../../components/shared/LoadingState.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { useProjectNotes, useSaveProjectNotes } from '../../../hooks/useProjectNotes.ts';
import { textareaClass } from '../../../lib/formStyles.ts';

function formatSavedAt(updatedAt: null | number): string {
	if (updatedAt === null) return 'Not saved yet';
	return `Last saved ${new Date(updatedAt).toLocaleString()}`;
}

export function NotesTab({ projectId }: { projectId: string }) {
	const notes = useProjectNotes(projectId);
	const saveNotes = useSaveProjectNotes(projectId);
	const [draft, setDraft] = useState('');
	// Seed the editor once the pad loads, and re-sync whenever a save (or refetch) advances the
	// server content so the dirty indicator reflects the persisted state. Adjusting state during
	// render (guarded by the last-synced value) is React's sanctioned alternative to a setState
	// effect here — https://react.dev/learn/you-might-not-need-an-effect.
	const serverContent = notes.data?.content;
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
	const save = () => {
		if (!dirty || saveNotes.isPending) return;
		saveNotes.mutate(draft, {
			onError: (error) => {
				toast.error(error instanceof Error ? error.message : 'Could not save notes');
			},
			onSuccess: () => {
				toast.success('Notes saved');
			},
		});
	};

	return (
		<Card className="space-y-3">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					<NotebookPen className="h-4 w-4 text-teal-700 dark:text-teal-300" />
					<div>
						<h2 className="text-sm font-semibold text-foreground">Notes</h2>
						<p className="text-xs text-neutral-500">
							A free-form, persistent markdown scratch pad saved to{' '}
							<code>.aidd/notes.md</code>.
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{dirty ? <Badge tone="amber">Unsaved changes</Badge> : null}
					<Button
						disabled={!dirty || saveNotes.isPending}
						onClick={save}
						variant="primary">
						<Save className="h-4 w-4" />
						{saveNotes.isPending ? 'Saving…' : 'Save'}
					</Button>
				</div>
			</div>
			<textarea
				aria-label="Project notes"
				className={`${textareaClass} min-h-[28rem] font-mono`}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={(event) => {
					if ((event.metaKey || event.ctrlKey) && event.key === 's') {
						event.preventDefault();
						save();
					}
				}}
				placeholder="Jot down anything about this project — it persists in .aidd/notes.md."
				value={draft}
			/>
			<p className="text-xs text-neutral-500">{formatSavedAt(notes.data.updatedAt)}</p>
		</Card>
	);
}

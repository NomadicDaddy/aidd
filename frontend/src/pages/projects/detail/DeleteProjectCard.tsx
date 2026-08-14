import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { ProjectDeleteMode, ProjectDetail } from '../../../api/types.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { FieldRow } from '../../../components/ui/field.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { useDeleteProject } from '../../../hooks/useProjects.ts';
import { cn } from '../../../lib/cn.ts';
import { traceDataMovement } from '../../../lib/dataMovementTrace.ts';
import { selectClass } from '../../../lib/formStyles.ts';
import { toneBorder, toneSurface, toneText } from '../../../lib/tones.ts';
import { projectPathsMatch } from './managementPaths.ts';

export function DeleteProjectCard({ project }: { project: ProjectDetail }) {
	const navigate = useNavigate();
	const deleteProject = useDeleteProject(project.id);
	const [deleteMode, setDeleteMode] = useState<ProjectDeleteMode>('metadata');
	const [deleteConfirmation, setDeleteConfirmation] = useState('');
	const confirmationMatches = projectPathsMatch(deleteConfirmation, project.path);
	const confirmationError =
		deleteConfirmation.trim() !== '' && !confirmationMatches
			? 'The path does not match this project.'
			: null;
	const deleteDisabled = deleteProject.isPending || !confirmationMatches;

	async function handleDelete(): Promise<void> {
		if (!confirmationMatches) return;
		try {
			// destructive-confirmation-allow: the confirmation here is the typed-path field above,
			// not a dialog. `deleteDisabled` holds the submit button until the operator has typed the
			// full project path, allowing only case and separator differences. The stored path is then
			// sent as `confirmation` for the backend's byte-exact re-check.
			await deleteProject.mutateAsync({
				confirmation: project.path,
				mode: deleteMode,
			});
			traceDataMovement({
				category: 'event',
				layer: 'ui',
				operation: 'project.delete.submit',
				source: 'DeleteProjectCard',
				summary: { mode: deleteMode, projectId: project.id },
			});
			toast.success(
				deleteMode === 'metadata' ? 'Project metadata removed' : 'Project deleted',
			);
			void navigate('/projects');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Project deletion failed');
		}
	}

	return (
		// The one card on the tab that can destroy the project sat in the same white surface as
		// 'Rename' and 'Move', so the only thing separating an edit from a deletion was reading
		// the title. It takes the red region tokens: the card is legible as destructive from the
		// edge of the eye, before any of it is read.
		<Card className={cn(toneBorder.red, toneSurface.red)}>
			<CardHeader
				description={
					<>
						Remove only <code className="font-mono">.aidd</code> metadata or delete the
						entire project directory.
					</>
				}
				headingLevel={3}
				icon={<AlertTriangle className={`h-4 w-4 ${toneText.red}`} />}
				title="Delete project"
			/>
			<div className="space-y-3">
				<FieldRow label="Delete mode">
					<select
						className={selectClass}
						onChange={(event) => setDeleteMode(event.target.value as ProjectDeleteMode)}
						value={deleteMode}>
						<option value="metadata">Remove .aidd metadata only</option>
						<option value="directory">Delete project directory</option>
					</select>
				</FieldRow>
				<FieldRow error={confirmationError} label="Type the full project path to confirm">
					<Input
						aria-label="Project path confirmation"
						className="font-mono"
						onChange={(event) => setDeleteConfirmation(event.target.value)}
						placeholder="Full project path"
						value={deleteConfirmation}
					/>
				</FieldRow>
				<Button
					disabled={deleteDisabled}
					onClick={() => void handleDelete()}
					variant="danger">
					<Trash2 className="h-4 w-4" />
					{deleteProject.isPending ? 'Deleting' : 'Delete project'}
				</Button>
			</div>
		</Card>
	);
}

import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { ProjectDeleteMode, ProjectDetail } from '../../../api/types.ts';

import { FilePath } from '../../../components/shared/FilePath.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { FieldRow } from '../../../components/ui/field.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { useDeleteProject } from '../../../hooks/useProjects.ts';
import { cn } from '../../../lib/cn.ts';
import { traceDataMovement } from '../../../lib/dataMovementTrace.ts';
import { fieldLabelClass, selectClass } from '../../../lib/formStyles.ts';
import { toneBorder, toneSurface, toneText } from '../../../lib/tones.ts';
import { compactFieldMeasureClass } from '../../../lib/typography.ts';
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
	const deleteDisabledReason = deleteProject.isPending
		? null
		: deleteConfirmation.trim() === ''
			? 'Type the full project path to enable deletion.'
			: !confirmationMatches
				? 'The confirmation path must match this project.'
				: null;
	const deleteActionLabel =
		deleteMode === 'metadata' ? 'Remove .aidd metadata' : 'Delete project directory';
	const deletePendingLabel =
		deleteMode === 'metadata' ? 'Removing .aidd metadata' : 'Deleting project directory';

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
		// Metadata removal stays on the standard card surface. Choosing directory deletion adds the
		// red edge and surface before the operator types the path, so the larger consequence is visible
		// while they confirm it and remains distinct from the filled danger action.
		<Card
			className={cn(
				deleteMode === 'directory' && toneBorder.red,
				deleteMode === 'directory' && toneSurface.red,
			)}>
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
				<FieldRow className={compactFieldMeasureClass} label="Delete mode">
					<select
						className={selectClass}
						onChange={(event) => {
							setDeleteMode(event.target.value as ProjectDeleteMode);
							setDeleteConfirmation('');
						}}
						value={deleteMode}>
						<option value="metadata">Remove .aidd metadata only</option>
						<option value="directory">Delete project directory</option>
					</select>
				</FieldRow>
				<div
					className={`rounded-md border border-border bg-muted p-3 text-sm ${compactFieldMeasureClass}`}
					id="delete-project-path">
					<div className={fieldLabelClass}>Project path</div>
					<FilePath
						className="mt-1 block text-xs break-all text-foreground"
						copyable
						path={project.path}
					/>
				</div>
				<FieldRow
					className={compactFieldMeasureClass}
					error={confirmationError}
					hint={
						<>
							{deleteMode === 'directory'
								? 'Deletes the project directory and everything under it.'
								: 'Removes .aidd metadata for this project, including its roadmap, features, audits and run history. Application code is untouched.'}{' '}
							This cannot be undone. Type{' '}
							<FilePath className="text-foreground" path={project.path} /> to confirm.
						</>
					}
					label="Confirm project path">
					<Input
						aria-describedby="delete-project-path"
						aria-label="Project path confirmation"
						autoCapitalize="none"
						autoComplete="off"
						autoCorrect="off"
						className="font-mono"
						onChange={(event) => setDeleteConfirmation(event.target.value)}
						placeholder="Full project path"
						spellCheck={false}
						value={deleteConfirmation}
					/>
				</FieldRow>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						aria-describedby={
							deleteDisabledReason ? 'delete-project-action-help' : undefined
						}
						disabled={deleteDisabled}
						onClick={() => void handleDelete()}
						variant="danger">
						<Trash2 className="h-4 w-4" />
						{deleteProject.isPending ? deletePendingLabel : deleteActionLabel}
					</Button>
					{deleteDisabledReason ? (
						<p
							className="text-xs text-muted-foreground"
							id="delete-project-action-help">
							{deleteDisabledReason}
						</p>
					) : null}
				</div>
			</div>
		</Card>
	);
}

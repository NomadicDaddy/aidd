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
import { traceDataMovement } from '../../../lib/dataMovementTrace.ts';
import { selectClass } from '../../../lib/formStyles.ts';
import { toneText } from '../../../lib/tones.ts';

export function DeleteProjectCard({ project }: { project: ProjectDetail }) {
	const navigate = useNavigate();
	const deleteProject = useDeleteProject(project.id);
	const [deleteMode, setDeleteMode] = useState<ProjectDeleteMode>('metadata');
	const [deleteConfirmation, setDeleteConfirmation] = useState('');
	const deleteDisabled =
		deleteProject.isPending ||
		deleteConfirmation.trim() !== project.path ||
		project.path === '';

	async function handleDelete(): Promise<void> {
		try {
			await deleteProject.mutateAsync({
				confirmation: deleteConfirmation.trim(),
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
		<Card>
			<CardHeader
				description={
					<>
						Remove only <code className="font-mono">.aidd</code> metadata or delete the
						entire project directory.
					</>
				}
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
				<FieldRow label="Type the full project path to confirm">
					<Input
						aria-label="Project path confirmation"
						className="font-mono"
						onChange={(event) => setDeleteConfirmation(event.target.value)}
						placeholder={project.path}
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

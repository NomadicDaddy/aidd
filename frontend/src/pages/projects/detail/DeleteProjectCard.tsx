import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import type { ProjectDeleteMode, ProjectDetail } from '../../../api/types.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { useDeleteProject } from '../../../hooks/useProjects.ts';
import { traceDataMovement } from '../../../lib/dataMovementTrace.ts';

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
				deleteMode === 'metadata' ? 'Project metadata removed' : 'Project deleted'
			);
			void navigate('/projects');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Project deletion failed');
		}
	}

	return (
		<Card>
			<div className="flex items-start gap-3">
				<AlertTriangle className="mt-0.5 h-5 w-5 text-red-700 dark:text-red-300" />
				<div>
					<h2 className="text-foreground text-base font-semibold">Delete project</h2>
					<p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
						Remove only `.aidd` metadata or delete the entire project directory.
					</p>
				</div>
			</div>
			<div className="mt-4 space-y-3">
				<label className="block text-sm font-medium text-neutral-800 dark:text-neutral-100">
					Delete mode
					<select
						className="mt-1 h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm outline-none focus-visible:border-neutral-500 focus-visible:ring-2 focus-visible:ring-neutral-200 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:focus-visible:ring-neutral-800"
						onChange={(event) => setDeleteMode(event.target.value as ProjectDeleteMode)}
						value={deleteMode}>
						<option value="metadata">Remove .aidd metadata only</option>
						<option value="directory">Delete project directory</option>
					</select>
				</label>
				<label className="block text-sm font-medium text-neutral-800 dark:text-neutral-100">
					Type the full project path to confirm
					<Input
						aria-label="Project path confirmation"
						className="mt-1 w-full font-mono"
						onChange={(event) => setDeleteConfirmation(event.target.value)}
						placeholder={project.path}
						value={deleteConfirmation}
					/>
				</label>
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

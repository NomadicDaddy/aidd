import { default as Pencil } from 'lucide-react/dist/esm/icons/pencil';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import type { ProjectDetail } from '../../../api/types.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { useMoveProject } from '../../../hooks/useProjects.ts';
import { traceDataMovement } from '../../../lib/dataMovementTrace.ts';
import {
	joinPreviewPath,
	parentDirectoryFromPath,
	projectNameFromPath,
} from './managementPaths.ts';

// Rename reuses the move endpoint with the project's own parent directory as the
// destination root, so the backend's active-run blocking, collision detection,
// and run-path reference updates all apply unchanged.
export function RenameProjectCard({ project }: { project: ProjectDetail }) {
	const navigate = useNavigate();
	const renameProject = useMoveProject(project.id);
	const currentProjectName = projectNameFromPath(project.path);
	const parentDirectory = parentDirectoryFromPath(project.path);
	const [renameName, setRenameName] = useState(currentProjectName);
	const trimmedRenameName = renameName.trim();
	const renamePreview = joinPreviewPath(parentDirectory, trimmedRenameName || currentProjectName);
	const renameDisabled =
		renameProject.isPending ||
		trimmedRenameName.length === 0 ||
		/[\\/]/.test(trimmedRenameName) ||
		trimmedRenameName === currentProjectName;

	async function handleRename(): Promise<void> {
		try {
			const moved = await renameProject.mutateAsync({
				destinationName: trimmedRenameName,
				destinationRoot: parentDirectory,
			});
			traceDataMovement({
				category: 'event',
				layer: 'ui',
				operation: 'project.rename.submit',
				source: 'RenameProjectCard',
				summary: { projectId: project.id },
			});
			toast.success('Project renamed');
			void navigate(`/projects/${encodeURIComponent(moved.id)}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Project rename failed');
		}
	}

	return (
		<Card>
			<div className="flex items-start gap-3">
				<Pencil className="mt-0.5 h-5 w-5 text-teal-700 dark:text-teal-300" />
				<div>
					<h2 className="text-base font-semibold text-foreground">Rename project</h2>
					<p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
						Rename the project directory in place. Runs and metadata follow the new
						path.
					</p>
				</div>
			</div>
			<div className="mt-4 space-y-3">
				<label className="block text-sm font-medium text-neutral-800 dark:text-neutral-100">
					New project name
					<Input
						aria-label="New project name"
						className="mt-1 w-full"
						onChange={(event) => setRenameName(event.target.value)}
						value={renameName}
					/>
				</label>
				<div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950">
					<div className="text-xs text-neutral-500 uppercase">New path</div>
					<div className="mt-1 font-mono text-xs break-all text-neutral-800 dark:text-neutral-200">
						{renamePreview}
					</div>
				</div>
				<Button
					disabled={renameDisabled}
					onClick={() => void handleRename()}
					variant="primary">
					<Pencil className="h-4 w-4" />
					{renameProject.isPending ? 'Renaming' : 'Rename project'}
				</Button>
			</div>
		</Card>
	);
}

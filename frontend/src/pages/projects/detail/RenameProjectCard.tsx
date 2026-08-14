import { default as Pencil } from 'lucide-react/dist/esm/icons/pencil';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { ProjectDetail } from '../../../api/types.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { FieldRow } from '../../../components/ui/field.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { useMoveProject } from '../../../hooks/useProjects.ts';
import { traceDataMovement } from '../../../lib/dataMovementTrace.ts';
import { fieldLabelClass } from '../../../lib/formStyles.ts';
import { toneText } from '../../../lib/tones.ts';
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
			<CardHeader
				description="Rename the project directory in place. Runs and metadata follow the new path."
				headingLevel={3}
				icon={<Pencil className={`h-4 w-4 ${toneText.teal}`} />}
				title="Rename project"
			/>
			<div className="space-y-3">
				<FieldRow label="New project name">
					<Input
						aria-label="New project name"
						onChange={(event) => setRenameName(event.target.value)}
						value={renameName}
					/>
				</FieldRow>
				<div className="rounded-md border border-border bg-muted p-3 text-sm">
					<div className={fieldLabelClass}>New path</div>
					<div className="mt-1 font-mono text-xs break-all text-foreground">
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

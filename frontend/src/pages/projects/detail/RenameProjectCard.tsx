import { default as Pencil } from 'lucide-react/dist/esm/icons/pencil';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { ProjectDetail } from '../../../api/types.ts';

import { FilePath } from '../../../components/shared/FilePath.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { FieldRow } from '../../../components/ui/field.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { useMoveProject } from '../../../hooks/useProjects.ts';
import { traceDataMovement } from '../../../lib/dataMovementTrace.ts';
import { fieldLabelClass } from '../../../lib/formStyles.ts';
import { toneText } from '../../../lib/tones.ts';
import { compactFieldMeasureClass } from '../../../lib/typography.ts';
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
	const renameDisabledReason = renameProject.isPending
		? null
		: trimmedRenameName.length === 0
			? 'Enter a project name.'
			: /[\\/]/.test(trimmedRenameName)
				? 'Use a folder name without path separators.'
				: trimmedRenameName === currentProjectName
					? 'Enter a name different from the current one.'
					: null;

	async function handleRename(): Promise<void> {
		try {
			const moved = await renameProject.mutateAsync({
				confirmation: project.path,
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
				<FieldRow className={compactFieldMeasureClass} label="New project name">
					<Input
						aria-label="New project name"
						onChange={(event) => setRenameName(event.target.value)}
						value={renameName}
					/>
				</FieldRow>
				<div
					className={`rounded-md border border-border bg-muted p-3 text-sm ${compactFieldMeasureClass}`}>
					<div className={fieldLabelClass}>New path</div>
					<FilePath
						className="mt-1 block text-xs break-all text-foreground"
						path={renamePreview}
					/>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						aria-describedby={
							renameDisabledReason ? 'rename-project-action-help' : undefined
						}
						disabled={renameDisabled}
						onClick={() => void handleRename()}
						variant="secondary">
						<Pencil className="h-4 w-4" />
						{renameProject.isPending ? 'Renaming' : 'Rename project'}
					</Button>
					{renameDisabledReason ? (
						<p
							className="text-xs text-muted-foreground"
							id="rename-project-action-help">
							{renameDisabledReason}
						</p>
					) : null}
				</div>
			</div>
		</Card>
	);
}

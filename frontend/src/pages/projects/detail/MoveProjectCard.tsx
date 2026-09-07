import { default as FolderInput } from 'lucide-react/dist/esm/icons/folder-input';
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
import { useSettingsConfig } from '../../../hooks/useSettings.ts';
import { traceDataMovement } from '../../../lib/dataMovementTrace.ts';
import { formatFilesystemPath } from '../../../lib/formatters.ts';
import { fieldLabelClass, selectClass } from '../../../lib/formStyles.ts';
import { toneText } from '../../../lib/tones.ts';
import { compactFieldMeasureClass } from '../../../lib/typography.ts';
import {
	joinPreviewPath,
	projectDirectoryNameError,
	projectNameFromPath,
	projectPathsMatch,
} from './managementPaths.ts';

export function MoveProjectCard({ project }: { project: ProjectDetail }) {
	const navigate = useNavigate();
	const settings = useSettingsConfig();
	const moveProject = useMoveProject(project.id);
	const [confirmation, setConfirmation] = useState('');
	const [destinationName, setDestinationName] = useState(project.name);
	const [destinationRoot, setDestinationRoot] = useState('');
	const roots = settings.data?.applicationRoots ?? [];
	const currentProjectName = projectNameFromPath(project.path);
	const moveName = destinationName.trim() || currentProjectName;
	const destinationNameError = projectDirectoryNameError(moveName);
	const confirmationMatches = projectPathsMatch(confirmation, project.path);
	const confirmationError =
		confirmation.trim() !== '' && !confirmationMatches
			? 'The path does not match this project.'
			: null;
	const destinationPreview =
		destinationRoot && !destinationNameError ? joinPreviewPath(destinationRoot, moveName) : '';
	const moveDisabled =
		moveProject.isPending ||
		!destinationRoot ||
		Boolean(destinationNameError) ||
		!confirmationMatches ||
		projectPathsMatch(destinationPreview, project.path);
	const availableRoots = roots.filter(
		(root) => !project.path.toLowerCase().startsWith(root.toLowerCase()),
	);
	const moveDisabledReason = moveProject.isPending
		? null
		: !destinationRoot
			? 'Select a destination root.'
			: destinationNameError
				? destinationNameError
				: projectPathsMatch(destinationPreview, project.path)
					? 'Choose a destination different from the current path.'
					: confirmation.trim() === ''
						? 'Type the full current project path to confirm the move.'
						: !confirmationMatches
							? 'The confirmation path must match this project.'
							: null;

	async function handleMove(): Promise<void> {
		if (moveDisabled) return;
		try {
			const moved = await moveProject.mutateAsync({
				confirmation,
				destinationName: moveName,
				destinationRoot,
			});
			traceDataMovement({
				category: 'event',
				layer: 'ui',
				operation: 'project.move.submit',
				source: 'MoveProjectCard',
				summary: { projectId: project.id },
			});
			toast.success('Project moved');
			void navigate(`/projects/${encodeURIComponent(moved.id)}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Project move failed');
		}
	}

	return (
		<Card>
			<CardHeader
				description="Move the project directory to another configured application root."
				headingLevel={3}
				icon={<FolderInput className={`h-4 w-4 ${toneText.teal}`} />}
				title="Move project"
			/>
			<div className="space-y-3">
				<FieldRow className={compactFieldMeasureClass} label="Destination root">
					<select
						className={selectClass}
						onChange={(event) => setDestinationRoot(event.target.value)}
						value={destinationRoot}>
						<option value="">Select destination root</option>
						{availableRoots.map((root) => (
							<option key={root} value={root}>
								{formatFilesystemPath(root)}
							</option>
						))}
					</select>
				</FieldRow>
				<FieldRow
					className={compactFieldMeasureClass}
					error={destinationNameError}
					label="Destination folder name">
					<Input
						aria-label="Destination folder name"
						onChange={(event) => setDestinationName(event.target.value)}
						value={destinationName}
					/>
				</FieldRow>
				<div
					className={`rounded-md border border-border bg-muted p-3 text-sm ${compactFieldMeasureClass}`}>
					<div className={fieldLabelClass}>Destination preview</div>
					{destinationNameError ? (
						<div className="mt-1 text-xs text-muted-foreground">
							Preview unavailable until the folder name is valid
						</div>
					) : destinationPreview ? (
						<FilePath
							className="mt-1 block text-xs break-all text-foreground"
							path={destinationPreview}
						/>
					) : (
						<div className="mt-1 text-xs text-foreground">
							Select a root to preview the move target
						</div>
					)}
				</div>
				<div
					className={`rounded-md border border-border bg-muted p-3 text-sm ${compactFieldMeasureClass}`}
					id="move-project-path">
					<div className={fieldLabelClass}>Current project path</div>
					<FilePath
						className="mt-1 block min-w-0 text-xs break-all text-foreground"
						copyable
						path={project.path}
					/>
				</div>
				<FieldRow
					className={compactFieldMeasureClass}
					error={confirmationError}
					hint={
						<>
							Moving changes the project directory on disk. Type{' '}
							<FilePath className="font-mono text-foreground" path={project.path} />{' '}
							to confirm.
						</>
					}
					label="Confirm current project path">
					<Input
						aria-describedby="move-project-path"
						aria-label="Current project path confirmation"
						autoCapitalize="none"
						autoComplete="off"
						autoCorrect="off"
						className="font-mono"
						onChange={(event) => setConfirmation(event.target.value)}
						placeholder="Full current project path"
						spellCheck={false}
						value={confirmation}
					/>
				</FieldRow>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						aria-describedby={
							moveDisabledReason ? 'move-project-action-help' : undefined
						}
						disabled={moveDisabled}
						onClick={() => void handleMove()}
						variant="secondary">
						<FolderInput className="h-4 w-4" />
						{moveProject.isPending ? 'Moving' : 'Move project'}
					</Button>
					{moveDisabledReason ? (
						<p className="text-xs text-muted-foreground" id="move-project-action-help">
							{moveDisabledReason}
						</p>
					) : null}
				</div>
			</div>
		</Card>
	);
}

import { default as FolderInput } from 'lucide-react/dist/esm/icons/folder-input';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { ProjectDetail } from '../../../api/types.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { FieldRow } from '../../../components/ui/field.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { useMoveProject } from '../../../hooks/useProjects.ts';
import { useSettingsConfig } from '../../../hooks/useSettings.ts';
import { traceDataMovement } from '../../../lib/dataMovementTrace.ts';
import { fieldLabelClass, selectClass } from '../../../lib/formStyles.ts';
import { toneText } from '../../../lib/tones.ts';
import { joinPreviewPath, projectNameFromPath } from './managementPaths.ts';

export function MoveProjectCard({ project }: { project: ProjectDetail }) {
	const navigate = useNavigate();
	const settings = useSettingsConfig();
	const moveProject = useMoveProject(project.id);
	const [destinationName, setDestinationName] = useState(project.name);
	const [destinationRoot, setDestinationRoot] = useState('');
	const roots = settings.data?.applicationRoots ?? [];
	const currentProjectName = projectNameFromPath(project.path);
	const moveName = destinationName.trim() || currentProjectName;
	const destinationPreview = destinationRoot ? joinPreviewPath(destinationRoot, moveName) : '';
	const moveDisabled =
		moveProject.isPending ||
		!destinationRoot ||
		moveName.length === 0 ||
		destinationPreview === project.path;
	const availableRoots = roots.filter(
		(root) => !project.path.toLowerCase().startsWith(root.toLowerCase()),
	);

	async function handleMove(): Promise<void> {
		try {
			const moved = await moveProject.mutateAsync({
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
				icon={<FolderInput className={`h-4 w-4 ${toneText.teal}`} />}
				title="Move project"
			/>
			<div className="space-y-3">
				<FieldRow label="Destination root">
					<select
						className={selectClass}
						onChange={(event) => setDestinationRoot(event.target.value)}
						value={destinationRoot}>
						<option value="">Select destination root</option>
						{availableRoots.map((root) => (
							<option key={root} value={root}>
								{root}
							</option>
						))}
					</select>
				</FieldRow>
				<FieldRow label="Destination folder name">
					<Input
						aria-label="Destination folder name"
						onChange={(event) => setDestinationName(event.target.value)}
						value={destinationName}
					/>
				</FieldRow>
				<div className="rounded-md border border-border bg-muted p-3 text-sm">
					<div className={fieldLabelClass}>Destination preview</div>
					<div className="mt-1 font-mono text-xs break-all text-foreground">
						{destinationPreview || 'Select a root to preview the move target'}
					</div>
				</div>
				<Button disabled={moveDisabled} onClick={() => void handleMove()} variant="primary">
					<FolderInput className="h-4 w-4" />
					{moveProject.isPending ? 'Moving' : 'Move project'}
				</Button>
			</div>
		</Card>
	);
}

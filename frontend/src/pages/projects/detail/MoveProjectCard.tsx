import { default as FolderInput } from 'lucide-react/dist/esm/icons/folder-input';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { ProjectDetail } from '../../../api/types.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { useMoveProject } from '../../../hooks/useProjects.ts';
import { useSettingsConfig } from '../../../hooks/useSettings.ts';
import { traceDataMovement } from '../../../lib/dataMovementTrace.ts';
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
			<div className="flex items-start gap-3">
				<FolderInput className="mt-0.5 h-5 w-5 text-teal-700 dark:text-teal-300" />
				<div>
					<h2 className="text-base font-semibold text-foreground">Move project</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Move the project directory to another configured application root.
					</p>
				</div>
			</div>
			<div className="mt-4 space-y-3">
				<label className="block text-sm font-medium text-foreground">
					Destination root
					<select
						className="mt-1 h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none focus-visible:border-border focus-visible:ring-2 focus-visible:ring-ring"
						onChange={(event) => setDestinationRoot(event.target.value)}
						value={destinationRoot}>
						<option value="">Select destination root</option>
						{availableRoots.map((root) => (
							<option key={root} value={root}>
								{root}
							</option>
						))}
					</select>
				</label>
				<label className="block text-sm font-medium text-foreground">
					Destination folder name
					<Input
						aria-label="Destination folder name"
						className="mt-1 w-full"
						onChange={(event) => setDestinationName(event.target.value)}
						value={destinationName}
					/>
				</label>
				<div className="rounded-md border border-border bg-muted p-3 text-sm">
					<div className="text-xs text-muted-foreground uppercase">
						Destination preview
					</div>
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

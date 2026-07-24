import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import type { ProjectDetail } from '../../../api/types.ts';
import type { LaunchTargetValue } from '../../../api/types/launchDefaults.ts';

import { LaunchTargetControl } from '../../../components/shared/LaunchTargetControl.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { useRecipes } from '../../../hooks/useRecipes.ts';

export function ReintakeCard({ project }: { project: ProjectDetail }) {
	const navigate = useNavigate();
	const recipes = useRecipes();
	const [launchTarget, setLaunchTarget] = useState<LaunchTargetValue>({});

	function handleReintake(): void {
		recipes.launchRecipe.mutate(
			{ id: 'project-reintake', launchTarget, parameters: {}, projectDir: project.path },
			{
				onError: (error) =>
					toast.error('Could not start re-intake', {
						description: error instanceof Error ? error.message : 'Unknown error.',
					}),
				onSuccess: (session) => {
					toast.success('Re-intake started');
					void navigate(`/pipeline-sessions/${session.id}`);
				},
			}
		);
	}

	return (
		<Card>
			<div className="flex items-start gap-3">
				<RefreshCw className="mt-0.5 h-5 w-5 text-teal-700 dark:text-teal-300" />
				<div>
					<h2 className="text-foreground text-base font-semibold">Re-run intake</h2>
					<p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
						Reconcile or repair existing `.aidd` metadata and re-run the metadata-only
						project-intake pipeline. Refreshes artifacts without touching app code.
					</p>
				</div>
			</div>
			<div className="mt-4 flex flex-wrap items-center gap-3">
				<Button
					disabled={recipes.launchRecipe.isPending}
					onClick={handleReintake}
					variant="primary">
					<RefreshCw className="h-4 w-4" />
					{recipes.launchRecipe.isPending ? 'Starting' : 'Re-run intake'}
				</Button>
				<LaunchTargetControl
					onChange={setLaunchTarget}
					projectDir={project.path}
					value={launchTarget}
				/>
			</div>
		</Card>
	);
}

import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { ProjectDetail } from '../../../api/types.ts';
import type { LaunchTargetValue } from '../../../api/types/launchDefaults.ts';

import { LaunchTargetControl } from '../../../components/shared/LaunchTargetControl.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useRecipes } from '../../../hooks/useRecipes.ts';
import { toneText } from '../../../lib/tones.ts';

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
			},
		);
	}

	return (
		<Card>
			{/* The canonical card header, and a real <code> element: the description was spelling
			    the path with markdown backticks into a plain <p>, which printed the backticks. */}
			<CardHeader
				description={
					<>
						Reconcile or repair existing <code className="font-mono">.aidd</code>{' '}
						metadata and re-run the metadata-only project-intake pipeline. Refreshes
						artifacts without touching app code.
					</>
				}
				headingLevel={3}
				icon={<RefreshCw className={`h-4 w-4 ${toneText.teal}`} />}
				title="Re-run intake"
			/>
			<div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
				<Button
					disabled={recipes.launchRecipe.isPending}
					onClick={handleReintake}
					variant="secondary">
					<RefreshCw className="h-4 w-4" />
					{recipes.launchRecipe.isPending ? 'Starting' : 'Re-run intake'}
				</Button>
				<LaunchTargetControl
					label="Launch target"
					onChange={setLaunchTarget}
					projectDir={project.path}
					size="default"
					value={launchTarget}
				/>
			</div>
		</Card>
	);
}

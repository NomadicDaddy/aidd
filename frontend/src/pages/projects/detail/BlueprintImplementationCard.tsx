import { default as Hammer } from 'lucide-react/dist/esm/icons/hammer';
import { default as LoaderCircle } from 'lucide-react/dist/esm/icons/loader-circle';
import { toast } from 'sonner';

import type { ProjectDetail } from '../../../api/types.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useStartProjectImplementation } from '../../../hooks/useProjects.ts';

export function BlueprintImplementationCard({ project }: { project: ProjectDetail }) {
	const startImplementation = useStartProjectImplementation(project.id);
	const implementation = project.implementation;

	async function startBuilding(): Promise<void> {
		try {
			const result = await startImplementation.mutateAsync();
			toast.success('Implementation started', {
				description: `${result.feature.title} · run ${result.runId}`,
			});
		} catch (error) {
			toast.error('Could not start implementation', {
				description: error instanceof Error ? error.message : 'Unknown error.',
			});
		}
	}

	if (implementation.state === 'building' || implementation.state === 'complete') return null;

	return (
		<Card
			className={
				implementation.state === 'blocked'
					? 'border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20'
					: 'border-teal-200 bg-teal-50/60 dark:border-teal-900 dark:bg-teal-950/20'
			}>
			<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
				<div className="min-w-0">
					<CardHeader
						className="mb-0"
						description={
							implementation.state === 'blueprint_ready'
								? 'The app scaffold, reviewed backlog, and roadmap are ready. Implementation has not started.'
								: implementation.reason
						}
						icon={
							implementation.state === 'preparing' ? (
								<LoaderCircle className="h-4 w-4 animate-spin text-teal-700 dark:text-teal-300" />
							) : (
								<Hammer className="h-4 w-4 text-teal-700 dark:text-teal-300" />
							)
						}
						title={
							implementation.state === 'blueprint_ready'
								? 'Blueprint ready for review'
								: implementation.state === 'preparing'
									? 'Preparing blueprint'
									: 'Blueprint needs attention'
						}
					/>
					{implementation.firstFeature ? (
						<p className="mt-2 text-sm text-foreground">
							First runnable feature:{' '}
							<span className="font-medium">{implementation.firstFeature.title}</span>
						</p>
					) : null}
				</div>
				{implementation.blueprintReady ? (
					<Button
						disabled={startImplementation.isPending}
						onClick={() => void startBuilding()}
						variant="primary">
						{startImplementation.isPending ? 'Starting…' : 'Start building'}
					</Button>
				) : null}
			</div>
		</Card>
	);
}

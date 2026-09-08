import { default as CircleAlert } from 'lucide-react/dist/esm/icons/circle-alert';
import { default as Clock } from 'lucide-react/dist/esm/icons/clock';
import { default as Hammer } from 'lucide-react/dist/esm/icons/hammer';
import { default as LoaderCircle } from 'lucide-react/dist/esm/icons/loader-circle';
import { Link } from 'react-router';
import { toast } from 'sonner';

import type { ProjectDetail } from '../../../api/types.ts';

import { Button, buttonClassName } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useStartProjectImplementation } from '../../../hooks/useProjects.ts';
import { cn } from '../../../lib/cn.ts';
import { toneBorder, toneSurface, toneText } from '../../../lib/tones.ts';
import {
	type BlueprintIndicator,
	describeBlueprintImplementation,
} from './blueprintImplementationView.ts';

function IndicatorIcon({
	indicator,
	tone,
}: {
	indicator: BlueprintIndicator;
	tone: 'amber' | 'teal';
}) {
	const className = `h-4 w-4 ${toneText[tone]}`;
	if (indicator === 'progress') return <LoaderCircle className={`${className} animate-spin`} />;
	if (indicator === 'queued') return <Clock className={className} />;
	if (indicator === 'idle') return <CircleAlert className={className} />;
	return <Hammer className={className} />;
}

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

	const view = describeBlueprintImplementation(implementation, project.path);

	return (
		<Card className={cn(toneBorder[view.tone], toneSurface[view.tone])}>
			<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
				<div className="min-w-0">
					<CardHeader
						className="mb-0"
						description={view.description}
						icon={<IndicatorIcon indicator={view.indicator} tone={view.tone} />}
						title={view.title}
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
				) : view.link ? (
					<Link
						className={cn(
							'shrink-0',
							buttonClassName('secondary', undefined, 'compact'),
						)}
						to={view.link.to}>
						{view.link.label}
					</Link>
				) : null}
			</div>
		</Card>
	);
}

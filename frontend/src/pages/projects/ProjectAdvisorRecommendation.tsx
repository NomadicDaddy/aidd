import { default as Sparkles } from 'lucide-react/dist/esm/icons/sparkles';

import type { ProjectCreateMode, ProjectRecommendResult } from '../../api/types.ts';

import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { cn } from '../../lib/cn.ts';
import { toneBorder, toneSurface, toneText } from '../../lib/tones.ts';

export function ProjectAdvisorRecommendation({
	createPending,
	onCancel,
	onCreate,
	onIngest,
	recommendation,
	trimmedDescription,
}: {
	createPending: boolean;
	onCancel: () => void;
	onCreate: (mode: ProjectCreateMode) => void;
	onIngest?: () => void;
	recommendation: ProjectRecommendResult;
	trimmedDescription: string;
}) {
	return (
		<Card className={cn('space-y-2 bg-card', toneBorder.teal)}>
			<div className="flex items-center gap-2 text-sm font-medium">
				<Sparkles className={`h-4 w-4 ${toneText.teal}`} />
				Advisor recommends: <span className={toneText.teal}>{recommendation.mode}</span>
			</div>
			<p className="text-xs text-foreground">{recommendation.reasoning}</p>
			{recommendation.mode === 'ingest' ? (
				<div
					className={cn(
						'space-y-2 rounded border p-2 text-xs',
						toneBorder.amber,
						toneSurface.amber,
						toneText.amber,
					)}>
					<p>
						The selected destination already contains a codebase. Ingest it as-is
						instead of scaffolding over it.
					</p>
					{onIngest ? (
						<Button onClick={onIngest} variant="primary">
							Switch to Ingest Existing
						</Button>
					) : null}
				</div>
			) : null}
			<div className="flex flex-wrap gap-2">
				<Button
					disabled={createPending}
					onClick={() => onCreate('fresh')}
					variant={recommendation.mode === 'fresh' ? 'primary' : 'secondary'}>
					Create as Fresh
				</Button>
				<Button
					disabled={createPending || trimmedDescription.length === 0}
					onClick={() => onCreate('spernakit')}
					title={
						trimmedDescription.length === 0
							? 'Add a description above to create with Spernakit.'
							: undefined
					}
					variant={recommendation.mode === 'spernakit' ? 'primary' : 'secondary'}>
					Create as Spernakit
				</Button>
				<Button onClick={onCancel} variant="secondary">
					Cancel
				</Button>
			</div>
		</Card>
	);
}

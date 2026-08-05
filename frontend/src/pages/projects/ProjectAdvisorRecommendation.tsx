import { default as Sparkles } from 'lucide-react/dist/esm/icons/sparkles';

import type { ProjectCreateMode, ProjectRecommendResult } from '../../api/types.ts';

import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { toneText } from '../../lib/tones.ts';

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
		<Card className="space-y-2 border-teal-300 bg-card dark:border-teal-800">
			<div className="flex items-center gap-2 text-sm font-medium">
				<Sparkles className={`h-4 w-4 ${toneText.teal}`} />
				Advisor recommends: <span className={toneText.teal}>{recommendation.mode}</span>
			</div>
			<p className="text-xs text-foreground">{recommendation.reasoning}</p>
			{recommendation.mode === 'ingest' ? (
				<div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
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
				<Button onClick={onCancel} variant="ghost">
					Cancel
				</Button>
			</div>
		</Card>
	);
}

import { buildSuggestionPrompt } from 'aidd-shared/contracts/director';
import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as CheckCircle2 } from 'lucide-react/dist/esm/icons/check-circle-2';
import { default as Clock } from 'lucide-react/dist/esm/icons/clock';
import { default as ExternalLink } from 'lucide-react/dist/esm/icons/external-link';
import { default as Eye } from 'lucide-react/dist/esm/icons/eye';
import { default as FileJson } from 'lucide-react/dist/esm/icons/file-json';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { DirectorCycle, DirectorSuggestionRecord } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button, buttonClassName, IconButton } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Dialog, DialogPanel } from '../../components/ui/dialog.tsx';
import { cycleElapsed, cycleStageLabels } from '../../lib/directorConstants.ts';
import { formatDate } from '../../lib/formatters.ts';
import { riskTone } from './directorUtils.ts';

export function DirectorRecentCycles({ cycles, now }: { cycles: DirectorCycle[]; now: number }) {
	return (
		<section aria-labelledby="director-cycles-heading">
			<Card>
				<h2 className="text-sm font-semibold text-foreground" id="director-cycles-heading">
					Recent Cycles
				</h2>
				<p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
					History of completed analysis passes.
				</p>
				<div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
					{cycles.map((cycle) => (
						<div
							className="rounded-md bg-neutral-50 p-3 dark:bg-neutral-900"
							key={cycle.id}>
							<div className="flex items-center justify-between gap-2">
								<div className="truncate text-sm font-medium text-foreground">
									{cycle.id}
								</div>
								<Badge>{cycle.status}</Badge>
							</div>
							<div className="mt-2 grid gap-1 text-xs text-neutral-500 dark:text-neutral-400">
								<div className="flex items-center gap-1.5">
									<Clock className="h-3.5 w-3.5" />
									<span>{formatDate(cycle.startedAt)}</span>
								</div>
								<div className="flex items-center gap-1.5">
									<Activity className="h-3.5 w-3.5" />
									<span>{cycleStageLabels[cycle.stage]}</span>
								</div>
								<div className="flex items-center gap-1.5">
									<CheckCircle2 className="h-3.5 w-3.5" />
									<span>{cycleElapsed(cycle, now)}</span>
								</div>
								<div className="flex items-center gap-1.5">
									<FileJson className="h-3.5 w-3.5" />
									<span>{cycle.totalSuggestions} suggestion(s)</span>
								</div>
							</div>
							{cycle.status === 'failed' && cycle.failureReason && (
								<div className="mt-2 flex items-start gap-1.5 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
									<AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
									<span className="break-words">{cycle.failureReason}</span>
								</div>
							)}
						</div>
					))}
					{cycles.length === 0 && <EmptyState>No cycles run yet.</EmptyState>}
				</div>
			</Card>
		</section>
	);
}

// Suggestion args are persisted as a JSON object string (the recipe's targeting
// parameters). Render them as readable `name: value` lines rather than raw JSON so
// the launch preview matches the prompt preview shown for run-backed suggestions.
function formatRecipeArgs(suggestedArgs: null | string): string {
	if (!suggestedArgs) return 'No additional recipe parameters.';
	try {
		const parsed: unknown = JSON.parse(suggestedArgs);
		if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
			const lines = Object.entries(parsed as Record<string, unknown>).map(
				([key, value]) => `${key}: ${String(value)}`,
			);
			return lines.length > 0 ? lines.join('\n') : 'No additional recipe parameters.';
		}
	} catch {
		// Not valid JSON — fall back to showing the raw stored value.
	}
	return suggestedArgs;
}

function SuggestionLaunchPreviewDialog({
	onClose,
	suggestion,
}: {
	onClose: () => void;
	suggestion: DirectorSuggestionRecord;
}) {
	const launchesRecipe = suggestion.suggestedRecipe !== null;
	return (
		<Dialog aria-labelledby="suggestion-launch-preview-title" onClose={onClose} open>
			<DialogPanel className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto p-5">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<h2
							className="text-lg font-semibold text-foreground"
							id="suggestion-launch-preview-title">
							Launch preview
						</h2>
						<p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
							Launch starts {launchesRecipe ? 'a recipe pipeline' : 'a coding run'} in{' '}
							<span className="font-medium text-foreground">
								{suggestion.projectId}
							</span>{' '}
							{launchesRecipe
								? `using ${suggestion.suggestedRecipe}:`
								: 'with this prompt:'}
						</p>
					</div>
					<IconButton ariaLabel="Close launch preview" onClick={onClose} variant="ghost">
						<X className="h-4 w-4" />
					</IconButton>
				</div>
				<pre className="mt-4 rounded-md bg-neutral-50 p-3 font-mono text-xs break-words whitespace-pre-wrap text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
					{launchesRecipe
						? formatRecipeArgs(suggestion.suggestedArgs)
						: buildSuggestionPrompt(suggestion)}
				</pre>
			</DialogPanel>
		</Dialog>
	);
}

export function DirectorSuggestionsList({
	onDismiss,
	onLaunch,
	suggestions,
}: {
	onDismiss: (id: string) => void;
	onLaunch: (id: string) => void;
	suggestions: DirectorSuggestionRecord[];
}) {
	const [previewSuggestion, setPreviewSuggestion] = useState<DirectorSuggestionRecord | null>(
		null,
	);
	const visibleSuggestions = suggestions.filter(
		(suggestion) => suggestion.status !== 'dismissed',
	);
	return (
		<section aria-labelledby="director-suggestions-heading" className="space-y-3">
			<div>
				<h2
					className="text-sm font-semibold text-foreground"
					id="director-suggestions-heading">
					Suggestions
				</h2>
				<p className="text-xs text-neutral-500 dark:text-neutral-400">
					Launch a per-project action or dismiss it once handled.
				</p>
			</div>
			{visibleSuggestions.length === 0 && (
				<EmptyState>No suggestions yet. Run a cycle to generate them.</EmptyState>
			)}
			{visibleSuggestions.map((suggestion) => {
				const isFleetWide = suggestion.projectId === null;
				const launchHref = suggestion.launchedPipelineSessionId
					? `/pipeline-sessions/${encodeURIComponent(suggestion.launchedPipelineSessionId)}`
					: suggestion.launchedRunId
						? `/runs?run=${encodeURIComponent(suggestion.launchedRunId)}`
						: null;
				return (
					<Card key={suggestion.id}>
						<div className="mb-3 flex flex-wrap items-start justify-between gap-3">
							<div>
								<h3 className="text-base font-semibold text-foreground">
									{suggestion.title}
								</h3>
								<p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
									{suggestion.description}
								</p>
							</div>
							<div className="flex flex-wrap gap-2">
								<Badge>{suggestion.taskType}</Badge>
								<Badge tone={riskTone(suggestion.riskLevel)}>
									{suggestion.riskLevel}
								</Badge>
								{isFleetWide && <Badge>Fleet-wide</Badge>}
								<Badge>{suggestion.status}</Badge>
							</div>
						</div>
						{isFleetWide && (
							<p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
								Fleet-wide suggestions are not directly launchable. Use them as
								guidance for choosing per-project actions, then dismiss when
								handled.
							</p>
						)}
						<div className="flex flex-wrap gap-2">
							{launchHref && (
								<Link
									className={buttonClassName('secondary', undefined, 'toolbar')}
									to={launchHref}>
									<ExternalLink className="h-4 w-4" />
									View launch output
								</Link>
							)}
							{!isFleetWide && (
								<Button
									aria-label={`Preview launch for suggestion: ${suggestion.title}`}
									onClick={() => setPreviewSuggestion(suggestion)}
									title="Show the exact prompt Launch will send"
									variant="secondary">
									<Eye className="h-4 w-4" />
									Preview
								</Button>
							)}
							<Button
								aria-label={`Launch suggestion: ${suggestion.title}`}
								disabled={suggestion.status !== 'pending' || isFleetWide}
								onClick={() => onLaunch(suggestion.id)}
								variant="primary">
								<Play className="h-4 w-4" />
								Launch
							</Button>
							<Button
								aria-label={`Dismiss suggestion: ${suggestion.title}`}
								disabled={
									suggestion.status === 'launching' ||
									suggestion.status === 'dismissed'
								}
								onClick={() => onDismiss(suggestion.id)}>
								<Trash2 className="h-4 w-4" />
								Dismiss
							</Button>
						</div>
					</Card>
				);
			})}
			{previewSuggestion && (
				<SuggestionLaunchPreviewDialog
					onClose={() => setPreviewSuggestion(null)}
					suggestion={previewSuggestion}
				/>
			)}
		</section>
	);
}

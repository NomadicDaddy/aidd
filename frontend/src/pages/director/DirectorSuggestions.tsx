import { buildSuggestionPrompt } from 'aidd-shared/contracts/director';
import { default as ExternalLink } from 'lucide-react/dist/esm/icons/external-link';
import { default as Eye } from 'lucide-react/dist/esm/icons/eye';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { useState } from 'react';
import { Link } from 'react-router';

import type { DirectorSuggestionRecord } from '../../api/types.ts';
import type { SegmentedControlOption } from '../../components/ui/segmented-control.tsx';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button, buttonClassName, IconButton } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { Dialog, DialogPanel } from '../../components/ui/dialog.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { humanizeEnum } from '../../lib/formatters.ts';
import { riskTone } from './directorUtils.ts';

const ALL = '__all__';

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
						<p className="mt-1 text-sm text-muted-foreground">
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
				<pre className="mt-4 rounded-md bg-muted p-3 font-mono text-xs break-words whitespace-pre-wrap text-foreground">
					{launchesRecipe
						? formatRecipeArgs(suggestion.suggestedArgs)
						: buildSuggestionPrompt(suggestion)}
				</pre>
			</DialogPanel>
		</Dialog>
	);
}

/**
 * One suggestion.
 *
 * Each of these used to be a full Card with an 16px title, a full-width description, a four-badge
 * cluster on its own line and four default-size buttons — roughly 190px for what is one decision.
 * The badges ride with the title, the description clamps to two lines, and the actions are compact,
 * so a queue of eight is scannable instead of a 1,500px column.
 */
function SuggestionRow({
	onDismiss,
	onLaunch,
	onPreview,
	suggestion,
}: {
	onDismiss: (id: string) => void;
	onLaunch: (id: string) => void;
	onPreview: (suggestion: DirectorSuggestionRecord) => void;
	suggestion: DirectorSuggestionRecord;
}) {
	const isFleetWide = suggestion.projectId === null;
	const launchHref = suggestion.launchedPipelineSessionId
		? `/pipeline-sessions/${encodeURIComponent(suggestion.launchedPipelineSessionId)}`
		: suggestion.launchedRunId
			? `/runs?run=${encodeURIComponent(suggestion.launchedRunId)}`
			: null;
	return (
		<Card>
			<div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
				<h3 className="min-w-0 text-sm font-semibold text-foreground">
					{suggestion.title}
				</h3>
				<div className="flex flex-wrap gap-1.5">
					<Badge>{humanizeEnum(suggestion.taskType)}</Badge>
					<Badge tone={riskTone(suggestion.riskLevel)}>
						{humanizeEnum(suggestion.riskLevel)} risk
					</Badge>
					{isFleetWide && <Badge>Fleet-wide</Badge>}
					<Badge>{humanizeEnum(suggestion.status)}</Badge>
				</div>
			</div>
			<p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
				{suggestion.description}
			</p>
			{isFleetWide && (
				<p className="mt-1 text-xs text-muted-foreground">
					Fleet-wide suggestions are not directly launchable. Use them as guidance for
					choosing per-project actions, then dismiss when handled.
				</p>
			)}
			<div className="mt-2 flex flex-wrap gap-2">
				{launchHref && (
					<Link
						className={buttonClassName('secondary', undefined, 'compact')}
						to={launchHref}>
						<ExternalLink className="h-3.5 w-3.5" />
						View launch output
					</Link>
				)}
				{!isFleetWide && (
					<Button
						aria-label={`Preview launch for suggestion: ${suggestion.title}`}
						onClick={() => onPreview(suggestion)}
						size="compact"
						title="Show the exact prompt Launch will send"
						variant="secondary">
						<Eye className="h-3.5 w-3.5" />
						Preview
					</Button>
				)}
				<Button
					aria-label={`Launch suggestion: ${suggestion.title}`}
					disabled={suggestion.status !== 'pending' || isFleetWide}
					onClick={() => onLaunch(suggestion.id)}
					size="compact"
					variant="primary">
					<Play className="h-3.5 w-3.5" />
					Launch
				</Button>
				<Button
					aria-label={`Dismiss suggestion: ${suggestion.title}`}
					disabled={
						suggestion.status === 'launching' || suggestion.status === 'dismissed'
					}
					onClick={() => onDismiss(suggestion.id)}
					size="compact"
					variant="ghost">
					<Trash2 className="h-3.5 w-3.5" />
					Dismiss
				</Button>
			</div>
		</Card>
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
	const [taskFilter, setTaskFilter] = useState<string>(ALL);
	const [riskFilter, setRiskFilter] = useState<string>(ALL);
	const openSuggestions = suggestions.filter((suggestion) => suggestion.status !== 'dismissed');
	const taskOptions: SegmentedControlOption<string>[] = [
		{ label: 'All types', value: ALL },
		...[...new Set(openSuggestions.map((suggestion) => suggestion.taskType))]
			.sort((left, right) => left.localeCompare(right))
			.map((taskType) => ({ label: humanizeEnum(taskType), value: taskType })),
	];
	const riskOptions: SegmentedControlOption<string>[] = [
		{ label: 'All risk', value: ALL },
		...['HIGH', 'MEDIUM', 'LOW']
			.filter((risk) => openSuggestions.some((suggestion) => suggestion.riskLevel === risk))
			.map((risk) => ({ label: humanizeEnum(risk), value: risk })),
	];
	const visibleSuggestions = openSuggestions.filter(
		(suggestion) =>
			(taskFilter === ALL || suggestion.taskType === taskFilter) &&
			(riskFilter === ALL || suggestion.riskLevel === riskFilter),
	);

	return (
		<section aria-labelledby="director-suggestions-heading" className="space-y-3">
			{/* The heading floated bare above a column of cards while its peer sat inside one, so
			    two side-by-side sections started on two different baselines. It lives in a Card,
			    which is also where the filters belong. */}
			<Card>
				<CardHeader
					badge={
						<Badge tone={visibleSuggestions.length > 0 ? 'amber' : 'emerald'}>
							{visibleSuggestions.length} open
						</Badge>
					}
					className="mb-0"
					description="Launch a per-project action or dismiss it once handled."
					id="director-suggestions-heading"
					title="Suggestions"
				/>
				{openSuggestions.length > 0 && (
					<div className="mt-3 flex flex-wrap items-center gap-2">
						<SegmentedControl
							ariaLabel="Filter suggestions by task type"
							onChange={setTaskFilter}
							options={taskOptions}
							value={taskFilter}
						/>
						<SegmentedControl
							ariaLabel="Filter suggestions by risk level"
							onChange={setRiskFilter}
							options={riskOptions}
							value={riskFilter}
						/>
					</div>
				)}
			</Card>
			{openSuggestions.length === 0 && (
				<EmptyState>No suggestions yet. Run a cycle to generate them.</EmptyState>
			)}
			{openSuggestions.length > 0 && visibleSuggestions.length === 0 && (
				<EmptyState>No suggestions match the selected filters.</EmptyState>
			)}
			{visibleSuggestions.map((suggestion) => (
				<SuggestionRow
					key={suggestion.id}
					onDismiss={onDismiss}
					onLaunch={onLaunch}
					onPreview={setPreviewSuggestion}
					suggestion={suggestion}
				/>
			))}
			{previewSuggestion && (
				<SuggestionLaunchPreviewDialog
					onClose={() => setPreviewSuggestion(null)}
					suggestion={previewSuggestion}
				/>
			)}
		</section>
	);
}

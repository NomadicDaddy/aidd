import { default as ExternalLink } from 'lucide-react/dist/esm/icons/external-link';
import { default as Eye } from 'lucide-react/dist/esm/icons/eye';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { useReducer, useState } from 'react';
import { Link } from 'react-router';

import type { DirectorRiskLevel, DirectorSuggestionRecord } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { Badge, StatusDot } from '../../components/ui/badge.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { riskLabel, riskTone } from '../../lib/directorConstants.ts';
import { humanizeEnum } from '../../lib/formatters.ts';
import { proseMeasureClass } from '../../lib/typography.ts';
import {
	ALL_SUGGESTIONS,
	initialSuggestionDisclosureState,
	MOBILE_SUGGESTION_BATCH_SIZE,
	suggestionDisclosureReducer,
} from './directorDisclosure.ts';
import { DirectorSuggestionFilters } from './DirectorSuggestionFilters.tsx';
import { SuggestionLaunchPreviewDialog } from './SuggestionLaunchPreviewDialog.tsx';

/**
 * Risk as a reading, not an alarm.
 *
 * A generated batch is uniform: all ten rows carried a filled red "High risk" pill, so the only red
 * on the surface appeared on 10 of 10 rows and told a reader nothing except that red had stopped
 * meaning "something is wrong". The ranking is still there to be read — it is what the risk filter
 * beside it sorts on — but it costs one `StatusDot` rather than the loudest object on the page.
 *
 * The Dashboard's Director Queue card draws the same field as a `Badge`, and that stays a
 * difference: four mixed-risk rows on a card are not 31 rows of one generated batch, and the pill
 * that reads well at four is what stopped meaning anything at 31. What the two surfaces do share is
 * the reading itself — `riskTone` and `riskLabel` are one mapping in lib/directorConstants.ts, so
 * the wording and the colour cannot drift between the two routes again. They already had: this
 * surface called a `LOW` suggestion emerald and the Dashboard called the same record teal.
 */
function RiskReading({ risk }: { risk: DirectorRiskLevel }) {
	return (
		<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
			<StatusDot tone={riskTone(risk)} />
			{riskLabel(risk)}
		</span>
	);
}

/**
 * One suggestion.
 *
 * Each of these used to be a full Card with an 16px title, a full-width description, a four-badge
 * cluster on its own line and four default-size buttons — roughly 190px for what is one decision.
 * The badges and actions ride opposite the title once the row is wide enough for two columns, the
 * description clamps to two lines, and the actions are compact, so a queue of eight is scannable
 * instead of a 1,500px column.
 *
 * A sunken block inside the section Card rather than a Card of its own: ten detached cards under a
 * header card made eleven outlined objects and a 2503px page, while `CycleRow` in the column beside
 * it renders the same shape as compact rows inside one card. This is that shape.
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
		// `@container` here rather than on the section: the row's own width is what decides whether
		// two columns fit, and the section is one element further out than the padding this row
		// sets. Wide, the metadata and the actions ride opposite the title in a fixed-width right
		// column — at 2250 the title used to end at x=577 and the badges start at x=1989, so the
		// row was mostly gutter and the buttons began a third line back at the far left. Narrow,
		// everything falls back to the stack it already was.
		//
		// The width that bounds this row is on the Card, not here — see the note there. Bounding
		// the row alone left a 1928px card wrapping 1024px rows; bounding the text inside the row
		// only moves the emptiness around. `ArtifactInventoryRow` carries its own `max-w-[61rem]`
		// because it has no card of its own to put one on.
		<div className="@container rounded-md bg-muted p-3">
			<div className="flex flex-col gap-2 @min-[61rem]:flex-row @min-[61rem]:items-start @min-[61rem]:justify-between @min-[61rem]:gap-4">
				<div className="min-w-0 @min-[61rem]:flex-1">
					<h3 className="text-sm font-semibold text-foreground">{suggestion.title}</h3>
					{/* No reading measure on this one, and the two-column shape above is why. The
					    right column is anchored to the row's far edge so that 31 rows of Launch and
					    Dismiss line up in a column the pointer can run down — that alignment is the
					    reason the shape exists. Capping the blurb under a right-anchored column does
					    not narrow the row, it only moves the empty space inside it: measured at
					    2250x1309 the text stopped at x=427 and the badges began at x=1632, so every
					    row carried 1205px of nothing between the thing being described and the
					    button that acts on it.

					    `proseMeasureClass` is for prose the reader returns to the start of a line
					    for. This is a `line-clamp-2` preview of a sentence the reader is scanning,
					    and letting it fill turns most rows from two lines into one — the card gets
					    shorter for the same reason the void closes. The Card's `max-w-[66rem]` is
					    what keeps the line from running long; a second cap here would take that
					    width back out of the text and hand it straight to the gutter. The
					    fleet-wide note below keeps its measure: that one is guidance to read, not a
					    title to scan. */}
					<p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
						{suggestion.description}
					</p>
					{isFleetWide && (
						<p className={`mt-1 text-xs text-muted-foreground ${proseMeasureClass}`}>
							Fleet-wide suggestions are not directly launchable. Use them as guidance
							for choosing per-project actions, then dismiss when handled.
						</p>
					)}
				</div>
				<div className="flex flex-col gap-2 @min-[61rem]:shrink-0 @min-[61rem]:items-end">
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 @min-[61rem]:justify-end">
						<Badge>{humanizeEnum(suggestion.taskType)}</Badge>
						{isFleetWide && <Badge>Fleet-wide</Badge>}
						<RiskReading risk={suggestion.riskLevel} />
						{/* Every row in this queue is pending — that is what makes it a queue — so
						    the badge restated the default state ten times and left no room for the
						    states that are worth a badge. Only a departure from it is announced. */}
						{suggestion.status === 'pending' ? null : (
							<Badge>{humanizeEnum(suggestion.status)}</Badge>
						)}
					</div>
					<div className="flex flex-wrap gap-2 @min-[61rem]:justify-end">
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
								suggestion.status === 'launching' ||
								suggestion.status === 'dismissed'
							}
							onClick={() => onDismiss(suggestion.id)}
							size="compact"
							variant="ghost">
							<Trash2 className="h-3.5 w-3.5" />
							Dismiss
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

export function DirectorSuggestionsList({
	isMobileLayout = false,
	onDismiss,
	onLaunch,
	suggestions,
}: {
	isMobileLayout?: boolean;
	onDismiss: (id: string) => void;
	onLaunch: (id: string) => void;
	suggestions: DirectorSuggestionRecord[];
}) {
	const [previewSuggestion, setPreviewSuggestion] = useState<DirectorSuggestionRecord | null>(
		null,
	);
	const [disclosure, dispatchDisclosure] = useReducer(
		suggestionDisclosureReducer,
		initialSuggestionDisclosureState,
	);
	const openSuggestions = suggestions.filter((suggestion) => suggestion.status !== 'dismissed');
	const filteredSuggestions = openSuggestions.filter(
		(suggestion) =>
			(disclosure.taskFilter === ALL_SUGGESTIONS ||
				suggestion.taskType === disclosure.taskFilter) &&
			(disclosure.riskFilter === ALL_SUGGESTIONS ||
				suggestion.riskLevel === disclosure.riskFilter),
	);
	const displayedSuggestions = isMobileLayout
		? filteredSuggestions.slice(0, disclosure.visibleCount)
		: filteredSuggestions;
	const hasMoreSuggestions = displayedSuggestions.length < filteredSuggestions.length;

	return (
		<section aria-labelledby="director-suggestions-heading" className="space-y-3">
			{/* The Card owns the 66rem cap so its border ends with its rows. The row's two-column
			    shape needs 61rem of inner width plus row and Card padding, so lowering this below
			    64.5rem silently restores the stacked layout. */}
			<Card className="max-w-[66rem]">
				<CardHeader
					badge={
						<Badge showDot tone={filteredSuggestions.length > 0 ? 'amber' : 'emerald'}>
							{filteredSuggestions.length} open
						</Badge>
					}
					className="mb-0"
					description="Launch a per-project action or dismiss it once handled."
					id="director-suggestions-heading"
					title="Suggestions"
				/>
				{openSuggestions.length > 0 && (
					<DirectorSuggestionFilters
						displayedCount={displayedSuggestions.length}
						onRiskFilterChange={(filter) =>
							dispatchDisclosure({ filter, type: 'set-risk-filter' })
						}
						onTaskFilterChange={(filter) =>
							dispatchDisclosure({ filter, type: 'set-task-filter' })
						}
						openSuggestions={openSuggestions}
						riskFilter={disclosure.riskFilter}
						taskFilter={disclosure.taskFilter}
					/>
				)}
				<div className="mt-3 space-y-2" id="director-suggestion-items">
					{openSuggestions.length === 0 && (
						<EmptyState>No suggestions yet. Run a cycle to generate them.</EmptyState>
					)}
					{openSuggestions.length > 0 && filteredSuggestions.length === 0 && (
						<EmptyState>No suggestions match the selected filters.</EmptyState>
					)}
					{displayedSuggestions.map((suggestion) => (
						<SuggestionRow
							key={suggestion.id}
							onDismiss={onDismiss}
							onLaunch={onLaunch}
							onPreview={setPreviewSuggestion}
							suggestion={suggestion}
						/>
					))}
				</div>
				{isMobileLayout && filteredSuggestions.length > MOBILE_SUGGESTION_BATCH_SIZE && (
					<div className="mt-3 border-t border-border pt-3">
						<Button
							aria-controls="director-suggestion-items"
							aria-disabled={!hasMoreSuggestions}
							className="w-full"
							onClick={() => {
								if (!hasMoreSuggestions) return;
								dispatchDisclosure({
									total: filteredSuggestions.length,
									type: 'show-more',
								});
							}}
							size="compact"
							variant="secondary">
							{hasMoreSuggestions ? 'Show more' : 'All suggestions shown'}
						</Button>
					</div>
				)}
			</Card>
			{previewSuggestion && (
				<SuggestionLaunchPreviewDialog
					onClose={() => setPreviewSuggestion(null)}
					suggestion={previewSuggestion}
				/>
			)}
		</section>
	);
}

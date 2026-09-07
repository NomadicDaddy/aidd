import { Link } from 'react-router';

import type { WebConfigSettings } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldRow, FormGrid } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useScheduledTasks } from '../../hooks/useScheduledTasks.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { proseMeasureClass } from '../../lib/typography.ts';
import { nextRunLabel, scheduleSummary } from '../scheduled/scheduledLabels.ts';
import { DirectorAutoLaunchFields } from './DirectorAutoLaunchFields.tsx';

/**
 * Director cycles. The cadence itself lives on the Scheduled page as a built-in task, so this card
 * shows its current state and links there rather than editing it. Suggestion granularity below is
 * still part of the unified Settings form (config-file backed), saved with the page's global Save
 * button via `form`/`setField`. Lives in AI & Director alongside the profile and orchestration
 * controls.
 */
export function DirectorAutoCycleSection({
	form,
	setField,
}: {
	form: WebConfigSettings;
	setField: <K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) => void;
}) {
	// Fetched rather than merely linked to. A bare link would reproduce the "it is configured
	// somewhere else, go find it" experience this consolidation exists to remove, and the query is
	// already cached and shared with the Scheduled page.
	const scheduled = useScheduledTasks();
	const director = (scheduled.tasks.data ?? []).find((task) => task.systemKey === 'director');
	const targeted = form.directorSuggestionGranularity === 'targeted';
	const maxPerBucketInvalid =
		!Number.isFinite(form.directorSuggestionMaxPerBucket) ||
		form.directorSuggestionMaxPerBucket < 1;

	return (
		<Card aria-labelledby="settings-director-cycles-heading" role="region">
			{/* Through the header's own description slot rather than as a paragraph beside it. Both
			    render the same 12px muted line, but only the slot carries the 46ch measure — a
			    hand-rolled sibling set 221 characters on one 1192px line while the card above it
			    wrapped at 366px, which is two reading measures inside one settings page. */}
			<CardHeader
				className="mb-0"
				description="The fleet analysis cycle runs as a built-in scheduled task, with the same cron, timezone, and occurrence history as everything else on the Scheduled page. Manual runs from the Director page are always available."
				id="settings-director-cycles-heading"
				title="Director Cycles"
			/>
			{director ? (
				<div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
					<Badge showDot>{director.state}</Badge>
					<span className="text-sm text-muted-foreground">
						{scheduleSummary(director.schedule)}
					</span>
					<span className="text-sm text-muted-foreground">
						Next {nextRunLabel(director.nextRunAt, director.schedule.timezone)}
					</span>
					<Link className={buttonClassName('secondary')} to="/scheduled">
						Manage on Scheduled
					</Link>
				</div>
			) : (
				<p className={`mt-4 text-xs ${toneText.amber} ${proseMeasureClass}`}>
					The built-in Director task has not been created yet. It is seeded at startup, so
					it appears here and on the Scheduled page after the next restart.
				</p>
			)}
			<div className="mt-6 border-t border-border pt-4">
				{/* Same slot, and the slot takes a node — the two emphasised terms survive the move. */}
				<CardHeader
					className="mb-0"
					description={
						<>
							<span className="font-medium">Targeted</span> surfaces one suggestion
							per concrete artifact (the next finding, remediation item, or feature to
							work) plus a rollup for the rest.{' '}
							<span className="font-medium">Aggregate</span> emits one sweeping
							&ldquo;resolve the whole backlog&rdquo; suggestion per bucket.
						</>
					}
					headingLevel={3}
					level="subsection"
					title="Suggestion Granularity"
				/>
				<FormGrid className="mt-4 gap-4 @min-[32rem]:grid-cols-2">
					<FieldRow label="Granularity">
						<select
							className={selectClass}
							onChange={(event) =>
								setField(
									'directorSuggestionGranularity',
									event.target.value === 'aggregate' ? 'aggregate' : 'targeted',
								)
							}
							value={form.directorSuggestionGranularity}>
							<option value="targeted">Targeted (one per artifact)</option>
							<option value="aggregate">Aggregate (one per backlog)</option>
						</select>
					</FieldRow>
					<FieldRow
						hint={
							targeted && maxPerBucketInvalid ? (
								<span className={toneText.amber}>
									Enter a positive number of artifacts.
								</span>
							) : (
								'Artifacts shown per bucket before the rest roll up.'
							)
						}
						label="Max per bucket">
						<Input
							disabled={!targeted}
							inputMode="numeric"
							onChange={(event) => {
								const parsed = Number(event.target.value);
								setField(
									'directorSuggestionMaxPerBucket',
									Number.isFinite(parsed) ? parsed : 0,
								);
							}}
							placeholder="3"
							value={String(form.directorSuggestionMaxPerBucket)}
						/>
					</FieldRow>
				</FormGrid>
			</div>
			<DirectorAutoLaunchFields form={form} setField={setField} />
		</Card>
	);
}

import type { WebConfigSettings } from '../../api/types.ts';

import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldCheckbox, FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { selectClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { proseMeasureClass } from '../../lib/typography.ts';

/**
 * Director auto-cycle schedule. Part of the unified Settings form (config-file
 * backed), saved with the page's global Save button via `form`/`setField`.
 * Lives in AI & Director alongside the profile and orchestration controls.
 */
export function DirectorAutoCycleSection({
	form,
	setField,
}: {
	form: WebConfigSettings;
	setField: <K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) => void;
}) {
	const intervalInvalid =
		!Number.isFinite(form.directorAutoCycleIntervalHours) ||
		form.directorAutoCycleIntervalHours < 1;
	const targeted = form.directorSuggestionGranularity === 'targeted';
	const maxPerBucketInvalid =
		!Number.isFinite(form.directorSuggestionMaxPerBucket) ||
		form.directorSuggestionMaxPerBucket < 1;

	return (
		<Card>
			{/* Through the header's own description slot rather than as a paragraph beside it. Both
			    render the same 12px muted line, but only the slot carries the 46ch measure — a
			    hand-rolled sibling set 221 characters on one 1192px line while the card above it
			    wrapped at 366px, which is two reading measures inside one settings page. */}
			<CardHeader
				className="mb-0"
				description="Automatically run a fleet analysis cycle on a fixed cadence. The web process runs a catch-up cycle on startup if the fleet hasn't been analyzed within the interval. Manual runs from the Director page are always available."
				title="Director Auto-Cycle"
			/>
			<div className="mt-4 grid gap-4 @min-[32rem]:grid-cols-2">
				<FieldCheckbox
					checked={form.directorAutoCycleEnabled}
					description="Off by default. When on, a cycle starts every interval and once on startup if the last cycle is older than the interval."
					label="Run cycles automatically"
					onChange={(event) => setField('directorAutoCycleEnabled', event.target.checked)}
				/>
				<FieldRow label="Interval (hours)">
					<Input
						inputMode="numeric"
						onChange={(event) => {
							const parsed = Number(event.target.value);
							setField(
								'directorAutoCycleIntervalHours',
								Number.isFinite(parsed) ? parsed : 0,
							);
						}}
						placeholder="12"
						value={String(form.directorAutoCycleIntervalHours)}
					/>
					{intervalInvalid ? (
						<span className={`text-xs ${toneText.amber}`}>
							Enter a positive number of hours.
						</span>
					) : null}
				</FieldRow>
			</div>
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
				<div className="mt-4 grid gap-4 @min-[32rem]:grid-cols-2">
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
					<FieldRow label="Max per bucket">
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
						{targeted && maxPerBucketInvalid ? (
							<span className={`text-xs ${toneText.amber}`}>
								Enter a positive number of artifacts.
							</span>
						) : (
							<span className={`text-xs text-muted-foreground ${proseMeasureClass}`}>
								Artifacts shown per bucket before the rest roll up.
							</span>
						)}
					</FieldRow>
				</div>
			</div>
		</Card>
	);
}

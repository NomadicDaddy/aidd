import type { WebConfigSettings } from '../../api/types.ts';

import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldCheckbox, FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { selectClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';

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
			<div>
				<CardHeader className="mb-0" title="Director Auto-Cycle" />
				<p className="mt-1 text-xs text-muted-foreground">
					Automatically run a fleet analysis cycle on a fixed cadence. The web process
					runs a catch-up cycle on startup if the fleet hasn&apos;t been analyzed within
					the interval. Manual runs from the Director page are always available.
				</p>
			</div>
			<div className="mt-4 grid gap-4 sm:grid-cols-2">
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
				<CardHeader
					className="mb-0"
					headingLevel={3}
					level="subsection"
					title="Suggestion granularity"
				/>
				<p className="mt-1 text-xs text-muted-foreground">
					<span className="font-medium">Targeted</span> surfaces one suggestion per
					concrete artifact (the next finding, remediation item, or feature to work) plus
					a rollup for the rest. <span className="font-medium">Aggregate</span> emits one
					sweeping &ldquo;resolve the whole backlog&rdquo; suggestion per bucket.
				</p>
				<div className="mt-4 grid gap-4 sm:grid-cols-2">
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
							<span className="text-xs text-muted-foreground">
								Artifacts shown per bucket before the rest roll up.
							</span>
						)}
					</FieldRow>
				</div>
			</div>
		</Card>
	);
}

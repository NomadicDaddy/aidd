import type { WebConfigSettings } from '../../api/types.ts';

import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';

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
		<Card className="p-3">
			<div>
				<h2 className="text-base font-semibold text-foreground">Director Auto-Cycle</h2>
				<p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
					Automatically run a fleet analysis cycle on a fixed cadence. The web process
					runs a catch-up cycle on startup if the fleet hasn&apos;t been analyzed within
					the interval. Manual runs from the Director page are always available.
				</p>
			</div>
			<div className="mt-4 grid gap-4 sm:grid-cols-2">
				<label className="flex items-start gap-2 rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800">
					<input
						checked={form.directorAutoCycleEnabled}
						className="mt-0.5"
						onChange={(event) =>
							setField('directorAutoCycleEnabled', event.target.checked)
						}
						type="checkbox"
					/>
					<span className="text-sm text-neutral-800 dark:text-neutral-100">
						<span className="font-medium">Run cycles automatically</span>
						<span className="mt-1 block text-xs text-neutral-500">
							Off by default. When on, a cycle starts every interval and once on
							startup if the last cycle is older than the interval.
						</span>
					</span>
				</label>
				<label className="space-y-1">
					<span className="text-xs font-medium text-neutral-500 uppercase">
						Interval (hours)
					</span>
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
						<span className="text-xs text-amber-600 dark:text-amber-400">
							Enter a positive number of hours.
						</span>
					) : null}
				</label>
			</div>
			<div className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
				<h3 className="text-sm font-semibold text-foreground">Suggestion granularity</h3>
				<p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
					<span className="font-medium">Targeted</span> surfaces one suggestion per
					concrete artifact (the next finding, remediation item, or feature to work) plus
					a rollup for the rest. <span className="font-medium">Aggregate</span> emits one
					sweeping &ldquo;resolve the whole backlog&rdquo; suggestion per bucket.
				</p>
				<div className="mt-4 grid gap-4 sm:grid-cols-2">
					<label className="space-y-1">
						<span className="text-xs font-medium text-neutral-500 uppercase">
							Granularity
						</span>
						<select
							className="w-full rounded-md border border-neutral-200 bg-transparent px-3 py-2 text-sm dark:border-neutral-800"
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
					</label>
					<label className="space-y-1">
						<span className="text-xs font-medium text-neutral-500 uppercase">
							Max per bucket
						</span>
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
							<span className="text-xs text-amber-600 dark:text-amber-400">
								Enter a positive number of artifacts.
							</span>
						) : (
							<span className="text-xs text-neutral-500">
								Artifacts shown per bucket before the rest roll up.
							</span>
						)}
					</label>
				</div>
			</div>
		</Card>
	);
}

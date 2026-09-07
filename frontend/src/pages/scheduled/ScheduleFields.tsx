import type { ScheduleBuilder, ScheduleIssue } from './scheduleBuilder.ts';

import { Button } from '../../components/ui/button.tsx';
import { Checkbox } from '../../components/ui/checkbox.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { formatZonedDate } from '../../lib/formatters.ts';
import { fieldErrorClass, fieldLabelClass, selectClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { compactFieldMeasureClass, microLabelClass } from '../../lib/typography.ts';
import { useScheduledDraft } from './scheduledDraftContext.ts';
import { scheduledFormTwoColumnMeasureClass } from './scheduledFormMeasure.ts';
import { advancedScheduleDescription, nextRunLabel } from './scheduledLabels.ts';

interface ScheduleFieldsProps {
	// The one thing wrong with the schedule, rendered on the field it concerns.
	issue: null | ScheduleIssue;
	nextRunAt?: null | number;
	onCronBlur: () => void;
	onPreview: () => void;
	onScheduleChange: () => void;
	onValidate: () => void;
	preview: null | number[];
	previewDisabled: boolean;
}

export function ScheduleFields(props: ScheduleFieldsProps) {
	const { draft, patch } = useScheduledDraft();
	const timezones = [
		'UTC',
		...Intl.supportedValuesOf('timeZone').filter((value) => value !== 'UTC'),
	];
	function change(update: Parameters<typeof patch>[0]): void {
		props.onScheduleChange();
		patch(update);
	}
	function errorFor(field: ScheduleIssue['field']): null | string {
		return props.issue?.field === field ? props.issue.message : null;
	}
	const cronDescription =
		draft.builder === 'advanced' ? advancedScheduleDescription(draft.cron) : null;
	const showNextRun = props.nextRunAt !== undefined && props.preview === null;
	const showCronDetails = cronDescription !== null || showNextRun;
	return (
		<>
			<div className={`grid gap-3 sm:grid-cols-2 ${scheduledFormTwoColumnMeasureClass}`}>
				<FieldRow label="Cadence">
					<select
						className={selectClass}
						onChange={(event) =>
							change({ builder: event.target.value as ScheduleBuilder })
						}
						value={draft.builder}>
						<option value="once">Once</option>
						<option value="daily">Daily</option>
						<option value="weekly">Selected weekdays</option>
						<option value="advanced">Advanced cron</option>
					</select>
				</FieldRow>
				{draft.builder === 'once' ? (
					<FieldRow error={errorFor('runAt')} label="Date and time" required>
						<Input
							className="font-mono"
							onBlur={props.onValidate}
							onChange={(event) => change({ runAt: event.target.value })}
							type="datetime-local"
							value={draft.runAt}
						/>
					</FieldRow>
				) : draft.builder === 'advanced' ? (
					<FieldRow
						error={errorFor('cron')}
						hint={
							showCronDetails ? (
								<div className="space-y-0.5 text-2xs">
									{cronDescription ? <p>{cronDescription}</p> : null}
									{showNextRun && props.nextRunAt !== undefined ? (
										props.nextRunAt === null ? (
											<p>No future occurrence scheduled.</p>
										) : (
											<p>
												Next occurrence{' '}
												<span className="font-mono">
													{nextRunLabel(props.nextRunAt, draft.timezone)}
												</span>
											</p>
										)
									) : null}
								</div>
							) : undefined
						}
						label="Five-field cron"
						required>
						<Input
							className="font-mono"
							onBlur={() => {
								props.onValidate();
								props.onCronBlur();
							}}
							onChange={(event) => change({ cron: event.target.value })}
							placeholder="0 2 * * 1-5"
							value={draft.cron}
						/>
					</FieldRow>
				) : (
					<FieldRow error={errorFor('time')} label="Time" required>
						<Input
							className="font-mono"
							onBlur={props.onValidate}
							onChange={(event) => change({ time: event.target.value })}
							type="time"
							value={draft.time}
						/>
					</FieldRow>
				)}
				<FieldRow label="Timezone">
					<select
						className={selectClass}
						onChange={(event) => change({ timezone: event.target.value })}
						value={draft.timezone}>
						{timezones.map((timezone) => (
							<option key={timezone} value={timezone}>
								{timezone}
							</option>
						))}
					</select>
				</FieldRow>
			</div>
			{draft.builder === 'weekly' && (
				<fieldset aria-required="true" className="space-y-2">
					<legend className={fieldLabelClass}>
						Weekdays
						<span aria-hidden="true" className={toneText.red}>
							{' *'}
						</span>
					</legend>
					<div className="flex flex-wrap items-center gap-3">
						{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
							<label className="flex items-center gap-2 text-sm" key={day}>
								<Checkbox
									checked={draft.weekdays.includes(String(index))}
									onChange={() => {
										props.onValidate();
										change({
											weekdays: draft.weekdays.includes(String(index))
												? draft.weekdays.filter(
														(value) => value !== String(index),
													)
												: [...draft.weekdays, String(index)],
										});
									}}
								/>
								{day}
							</label>
						))}
					</div>
					{errorFor('weekdays') && (
						<p aria-live="polite" className={fieldErrorClass}>
							{errorFor('weekdays')}
						</p>
					)}
				</fieldset>
			)}
			<div className="mt-3 grid items-start gap-3 sm:grid-cols-2">
				<Button
					className="justify-self-start"
					disabled={props.previewDisabled}
					onClick={props.onPreview}
					size="compact"
					variant="secondary">
					Preview next five
				</Button>
				{props.preview !== null ? (
					<div className="scheduled-content-reveal">
						<div className="scheduled-content-reveal-inner">
							<div
								aria-live="polite"
								className={`${compactFieldMeasureClass} rounded-md border border-border bg-muted p-3`}>
								<p className={`mb-2 text-muted-foreground ${microLabelClass}`}>
									Next occurrences
								</p>
								{props.preview.length ? (
									<ul className="space-y-1 font-mono text-sm">
										{props.preview.map((value) => (
											<li key={value}>
												{formatZonedDate(value, draft.timezone)}
											</li>
										))}
									</ul>
								) : (
									<p className="font-mono text-sm text-muted-foreground">
										No future occurrences
									</p>
								)}
							</div>
						</div>
					</div>
				) : null}
			</div>
		</>
	);
}

import type { ReactNode } from 'react';

import type { WebConfigSettings } from '../../api/types.ts';

import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldCheckbox, FieldRow, FormGrid } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { nullableNumber, numberValue } from './settingsUtils.ts';

function NumberFieldRow({
	error,
	hint,
	label,
	min,
	onChange,
	placeholder,
	required = false,
	step,
	value,
}: {
	error?: null | string;
	hint?: ReactNode;
	label: string;
	min?: number;
	onChange: (value: null | number) => void;
	placeholder?: string;
	required?: boolean;
	step?: number;
	value: null | number;
}) {
	return (
		// The grid track owns the 20rem measure, and FieldRow fills it without a local width override.
		<FieldRow error={error} hint={hint} label={label} required={required}>
			<Input
				// A fractional step means a currency field, which needs the decimal keypad; the
				// integer fields keep the plain numeric one.
				inputMode={step !== undefined && !Number.isInteger(step) ? 'decimal' : 'numeric'}
				min={min}
				onChange={(event) => onChange(nullableNumber(event.target.value))}
				placeholder={placeholder}
				step={step}
				type="number"
				value={numberValue(value)}
			/>
		</FieldRow>
	);
}

function ToggleRow({
	checked,
	label,
	onChange,
}: {
	checked: boolean;
	label: string;
	onChange: (checked: boolean) => void;
}) {
	return (
		<FieldCheckbox
			checked={checked}
			className="max-w-xs self-end rounded-none border-0 px-0"
			label={label}
			onChange={(event) => onChange(event.target.checked)}
		/>
	);
}

function SettingsBlock({
	children,
	description,
	title,
}: {
	children: ReactNode;
	description: string;
	title: string;
}) {
	return (
		// Was a two-column grid with the title in a 12rem left rail — the only header on the
		// Settings surface that sat beside what it described rather than above it.
		<section className="border-t border-border p-4 first:border-t-0">
			<CardHeader description={description} title={title} />
			<div>{children}</div>
		</section>
	);
}

export function RunLimitsSection({
	form,
	maxConcurrentRunsError,
	setField,
}: {
	form: WebConfigSettings;
	maxConcurrentRunsError: null | string;
	setField: <K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) => void;
}) {
	return (
		<Card className="w-full overflow-hidden p-0">
			<SettingsBlock
				description="Control parallel work and isolate coding runs when repository safety requires it."
				title="Concurrency">
				<FormGrid className="w-full @min-[32rem]:grid-cols-[repeat(2,minmax(0,20rem))] @min-[32rem]:justify-start">
					<NumberFieldRow
						error={maxConcurrentRunsError}
						label="Max concurrent runs"
						min={1}
						onChange={(value) => setField('maxConcurrentRuns', value ?? 0)}
						required
						value={form.maxConcurrentRuns || null}
					/>
					<ToggleRow
						checked={form.useWorktrees}
						label="Use isolated worktrees"
						onChange={(checked) => setField('useWorktrees', checked)}
					/>
				</FormGrid>
			</SettingsBlock>

			<SettingsBlock
				description="Bound overall runs, iterations, turns, and idle detection."
				title="Budgets & Timeouts">
				<FormGrid className="w-full @min-[32rem]:grid-cols-[repeat(2,minmax(0,20rem))] @min-[32rem]:justify-start @min-[61rem]:grid-cols-[repeat(3,minmax(0,20rem))]">
					<NumberFieldRow
						label="Timeout (seconds)"
						min={0}
						onChange={(value) => setField('timeoutSeconds', value)}
						placeholder="3600"
						value={form.timeoutSeconds}
					/>
					<NumberFieldRow
						label="Max iterations"
						min={0}
						onChange={(value) => setField('maxIterations', value)}
						placeholder="Unlimited"
						value={form.maxIterations}
					/>
					<NumberFieldRow
						label="Max turns per iteration"
						min={1}
						onChange={(value) => setField('maxTurns', value)}
						placeholder="25"
						value={form.maxTurns}
					/>
					<NumberFieldRow
						label="Max tokens per run"
						min={0}
						onChange={(value) => setField('maxTokens', value)}
						placeholder="Unlimited"
						value={form.maxTokens}
					/>
					<NumberFieldRow
						label="Max cost per run (USD)"
						min={0}
						onChange={(value) => setField('maxCostUsd', value)}
						placeholder="Unlimited"
						step={0.01}
						value={form.maxCostUsd}
					/>
					<div className="grid gap-3 @min-[32rem]:col-span-2 @min-[32rem]:grid-cols-2 @min-[61rem]:col-span-3">
						<NumberFieldRow
							label="Idle timeout (seconds)"
							min={0}
							onChange={(value) => setField('idleTimeoutSeconds', value)}
							placeholder="900"
							value={form.idleTimeoutSeconds}
						/>
						<NumberFieldRow
							label="Idle nudge timeout (seconds)"
							min={0}
							onChange={(value) => setField('idleNudgeTimeoutSeconds', value)}
							placeholder="600"
							value={form.idleNudgeTimeoutSeconds}
						/>
					</div>
				</FormGrid>
				<p className="mt-2 text-xs text-muted-foreground">
					Token and cost limits are cumulative across the run; exceeding either budget
					warns but does not stop it.
				</p>
			</SettingsBlock>

			<SettingsBlock
				description="Tune rate-limit recovery and low-level safeguards used by the orchestrator."
				title="Backoff & Safeguards">
				<FormGrid className="w-full @min-[32rem]:grid-cols-[repeat(2,minmax(0,20rem))] @min-[32rem]:justify-start @min-[61rem]:grid-cols-[repeat(3,minmax(0,20rem))]">
					<NumberFieldRow
						label="Rate limit backoff (seconds)"
						min={0}
						onChange={(value) => setField('rateLimitBackoffSeconds', value)}
						placeholder="300"
						value={form.rateLimitBackoffSeconds}
					/>
					<NumberFieldRow
						label="Rate limit buffer (seconds)"
						min={0}
						onChange={(value) => setField('rateLimitBufferSeconds', value)}
						placeholder="60"
						value={form.rateLimitBufferSeconds}
					/>
					<NumberFieldRow
						label="No-work backoff (ms)"
						min={0}
						onChange={(value) => setField('noWorkBackoffMs', value)}
						placeholder="30000"
						value={form.noWorkBackoffMs}
					/>
					<NumberFieldRow
						label="Max consecutive timeout retries"
						min={0}
						onChange={(value) => setField('maxConsecutiveTimeoutRetries', value)}
						placeholder="2"
						value={form.maxConsecutiveTimeoutRetries}
					/>
					<NumberFieldRow
						label="Dirty tree threshold"
						min={0}
						onChange={(value) => setField('dirtyTreeThreshold', value)}
						placeholder="50"
						value={form.dirtyTreeThreshold}
					/>
					<NumberFieldRow
						label="Abort threshold"
						min={0}
						onChange={(value) => setField('quitOnAbort', value)}
						placeholder="0"
						value={form.quitOnAbort}
					/>
					<ToggleRow
						checked={form.noClean}
						label="Skip clean-up"
						onChange={(checked) => setField('noClean', checked)}
					/>
				</FormGrid>
			</SettingsBlock>
		</Card>
	);
}

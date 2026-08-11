import type { ReactNode } from 'react';

import type { WebConfigSettings } from '../../api/types.ts';

import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldCheckbox, FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { nullableNumber, numberValue } from './settingsUtils.ts';

/**
 * The config key a label names, in mono under the label.
 *
 * Spelling it inline — 'Abort threshold (quitOnAbort)' — put it through the label's uppercase
 * transform and it stopped matching the key: ABORT THRESHOLD (QUITONABORT). `aria-hidden` keeps
 * the accessible name to the label alone.
 */
function ConfigKey({ name }: { name: string }) {
	return (
		<span aria-hidden="true" className="font-mono text-xs text-muted-foreground">
			{name}
		</span>
	);
}

function NumberFieldRow({
	configKey,
	label,
	min,
	onChange,
	placeholder,
	step,
	value,
}: {
	configKey?: string;
	label: string;
	min?: number;
	onChange: (value: null | number) => void;
	placeholder?: string;
	step?: number;
	value: null | number;
}) {
	return (
		// The key renders *after* the input. Between the label and the control it pushed this one
		// field 10px down from the two beside it in the same grid row — the only row on the surface
		// whose three inputs did not share a top edge — and, being the first element child, it was
		// also what FieldRow reached for when wiring `aria-invalid` and the error description.
		// Capped where the row is built, not at twenty call sites: a spinbutton holding `8` took
		// 962px of a 2250-wide viewport because the grid's third column was the terminal step and
		// nothing below it bounded the control. 20rem is the width the longest of these values
		// (`30000`) needs with its stepper, and the label above it wraps rather than stretching.
		<FieldRow className="max-w-xs" label={label}>
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
			{configKey ? <ConfigKey name={configKey} /> : null}
		</FieldRow>
	);
}

function ToggleRow({
	checked,
	configKey,
	label,
	onChange,
}: {
	checked: boolean;
	configKey?: string;
	label: string;
	onChange: (checked: boolean) => void;
}) {
	return (
		<FieldCheckbox
			checked={checked}
			label={label}
			meta={configKey ? <ConfigKey name={configKey} /> : null}
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
		<section className="border-t border-border p-3 first:border-t-0">
			<CardHeader description={description} title={title} />
			<div>{children}</div>
		</section>
	);
}

export function RunLimitsSection({
	form,
	setField,
}: {
	form: WebConfigSettings;
	setField: <K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) => void;
}) {
	return (
		<Card className="overflow-hidden p-0">
			<SettingsBlock
				description="Control parallel work and isolate coding runs when repository safety requires it."
				title="Concurrency">
				<div className="grid gap-3 @min-[32rem]:grid-cols-2">
					<NumberFieldRow
						label="Max concurrent runs"
						min={1}
						onChange={(value) => setField('maxConcurrentRuns', value ?? 0)}
						value={form.maxConcurrentRuns || null}
					/>
					<ToggleRow
						checked={form.useWorktrees}
						label="Use isolated worktrees"
						onChange={(checked) => setField('useWorktrees', checked)}
					/>
				</div>
			</SettingsBlock>

			<SettingsBlock
				description="Bound overall runs, iterations, turns, and idle detection. Empty optional values use built-in defaults. The token and cost budgets are cumulative across a whole run and warn-only — an exceeded budget logs a warning and the run continues."
				title="Budgets & Timeouts">
				<div className="grid gap-3 @min-[32rem]:grid-cols-2 @min-[61rem]:grid-cols-3">
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
			</SettingsBlock>

			<SettingsBlock
				description="Tune rate-limit recovery and low-level safeguards used by the orchestrator."
				title="Backoff & Safeguards">
				<div className="grid gap-3 @min-[32rem]:grid-cols-2 @min-[61rem]:grid-cols-3">
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
						configKey="quitOnAbort"
						label="Abort threshold"
						min={0}
						onChange={(value) => setField('quitOnAbort', value)}
						placeholder="0"
						value={form.quitOnAbort}
					/>
					<ToggleRow
						checked={form.noClean}
						configKey="noClean"
						label="Skip clean-up"
						onChange={(checked) => setField('noClean', checked)}
					/>
				</div>
			</SettingsBlock>
		</Card>
	);
}

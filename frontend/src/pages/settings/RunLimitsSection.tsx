import type { ReactNode } from 'react';

import type { WebConfigSettings } from '../../api/types.ts';

import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { fieldLabelClass } from '../../lib/formStyles.ts';
import { numberValue, nullableNumber } from './settingsUtils.ts';

function FieldRow({
	label,
	min,
	onChange,
	placeholder,
	value,
}: {
	label: string;
	min?: number;
	onChange: (value: null | number) => void;
	placeholder?: string;
	value: null | number;
}) {
	return (
		<label className="space-y-1">
			<span className={fieldLabelClass}>{label}</span>
			<Input
				inputMode="numeric"
				min={min}
				onChange={(event) => onChange(nullableNumber(event.target.value))}
				placeholder={placeholder}
				type="number"
				value={numberValue(value)}
			/>
		</label>
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
		<label className="flex min-h-9 items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800">
			<input
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
				type="checkbox"
			/>
			<span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
				{label}
			</span>
		</label>
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
		<section className="grid gap-4 border-t border-neutral-200 p-3 first:border-t-0 lg:grid-cols-[minmax(12rem,0.65fr)_minmax(0,1.35fr)] dark:border-neutral-800">
			<div>
				<h2 className="text-foreground text-sm font-semibold">{title}</h2>
				<p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
					{description}
				</p>
			</div>
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
				<div className="grid gap-3 sm:grid-cols-2">
					<FieldRow
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
				description="Bound overall runs, iterations, turns, and idle detection. Empty optional values use built-in defaults."
				title="Budgets & Timeouts">
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					<FieldRow
						label="Timeout (seconds)"
						min={0}
						onChange={(value) => setField('timeoutSeconds', value)}
						placeholder="3600"
						value={form.timeoutSeconds}
					/>
					<FieldRow
						label="Max iterations"
						min={0}
						onChange={(value) => setField('maxIterations', value)}
						placeholder="Unlimited"
						value={form.maxIterations}
					/>
					<FieldRow
						label="Max turns per iteration"
						min={1}
						onChange={(value) => setField('maxTurns', value)}
						placeholder="25"
						value={form.maxTurns}
					/>
					<FieldRow
						label="Idle timeout (seconds)"
						min={0}
						onChange={(value) => setField('idleTimeoutSeconds', value)}
						placeholder="900"
						value={form.idleTimeoutSeconds}
					/>
					<FieldRow
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
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					<FieldRow
						label="Rate limit backoff (seconds)"
						min={0}
						onChange={(value) => setField('rateLimitBackoffSeconds', value)}
						placeholder="300"
						value={form.rateLimitBackoffSeconds}
					/>
					<FieldRow
						label="Rate limit buffer (seconds)"
						min={0}
						onChange={(value) => setField('rateLimitBufferSeconds', value)}
						placeholder="60"
						value={form.rateLimitBufferSeconds}
					/>
					<FieldRow
						label="No-work backoff (ms)"
						min={0}
						onChange={(value) => setField('noWorkBackoffMs', value)}
						placeholder="30000"
						value={form.noWorkBackoffMs}
					/>
					<FieldRow
						label="Dirty tree threshold"
						min={0}
						onChange={(value) => setField('dirtyTreeThreshold', value)}
						placeholder="50"
						value={form.dirtyTreeThreshold}
					/>
					<FieldRow
						label="Abort threshold (quitOnAbort)"
						min={0}
						onChange={(value) => setField('quitOnAbort', value)}
						placeholder="0"
						value={form.quitOnAbort}
					/>
					<ToggleRow
						checked={form.noClean}
						label="Skip clean-up (noClean)"
						onChange={(checked) => setField('noClean', checked)}
					/>
				</div>
			</SettingsBlock>
		</Card>
	);
}

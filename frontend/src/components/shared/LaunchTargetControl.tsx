import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { default as Settings2 } from 'lucide-react/dist/esm/icons/settings-2';
import { useId, useState } from 'react';

import type { BackendName, ReasoningEffort, RunMode } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

import { useLaunchDefaults } from '../../hooks/useLaunchDefaults.ts';
import { backendLabel, backendOptions } from '../../lib/backends.ts';
import { cn } from '../../lib/cn.ts';
import { fieldLabelClass, selectClass } from '../../lib/formStyles.ts';
import { Button } from '../ui/button.tsx';
import { Dialog, DialogPanel } from '../ui/dialog.tsx';
import { Input } from '../ui/input.tsx';
import { Tooltip } from '../ui/tooltip.tsx';
import { ExecutionIdentityBadges, ExecutionIdentityDetails } from './ExecutionIdentityBadges.tsx';

export type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

const reasoningOptions: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

export type LaunchRole = 'exec' | 'overseer' | 'primary' | 'secondary';

const roleLabels: Record<LaunchRole, string> = {
	exec: 'Execution',
	overseer: 'Overseer',
	primary: 'Primary',
	secondary: 'Secondary',
};

const modelSourceLabels: Record<string, string> = {
	'backend-config': 'backend default from config',
	'mode-config': 'mode default from config',
	override: 'custom override',
	'provider-default': 'provider default',
	'shared-config': 'shared default from config',
	unset: 'backend decides',
};

export interface LaunchTargetControlProps {
	disabled?: boolean;
	mode?: RunMode;
	onChange: (value: LaunchTargetValue) => void;
	projectDir?: string;
	role?: LaunchRole;
	value: LaunchTargetValue;
	variant?: 'chip' | 'inline';
}

function hasLaunchOverride(value: LaunchTargetValue): boolean {
	return (
		value.backend !== undefined ||
		(value.model ?? '') !== '' ||
		(value.reasoningEffort ?? '') !== ''
	);
}

// The uniform "what CLI/model will this launch use" control. Two variants:
// - 'chip' (default): a compact summary chip of the resolved effective values (from
//   /api/v1/launch-defaults — project config overlaid on global config, mode-aware) that
//   opens a modal for editing backend/model/effort overrides.
// - 'inline': the same override fields rendered as an always-visible grid, used for the
//   triumvirate role columns.
// Unset fields track the server default live; set fields are explicit overrides sent with
// the launch request.
export function LaunchTargetControl({
	disabled,
	mode,
	onChange,
	projectDir,
	role,
	value,
	variant = 'chip',
}: LaunchTargetControlProps) {
	const [open, setOpen] = useState(false);
	const panelId = useId();
	const titleId = useId();
	const defaults = useLaunchDefaults(projectDir || undefined, mode);
	const roleDefault = role && role !== 'primary' ? defaults.data?.triumvirate[role] : undefined;
	const effective = defaults.data?.effective;
	const defaultBackend = roleDefault ? (roleDefault.backend ?? undefined) : effective?.backend;
	const defaultModel = roleDefault ? (roleDefault.model ?? undefined) : effective?.model;
	const shownBackend = value.backend ?? defaultBackend;
	const shownModel = (value.model ?? '') !== '' ? value.model : defaultModel;
	const shownReasoningEffort = value.reasoningEffort ?? effective?.reasoningEffort;
	const shownProvider =
		effective && shownBackend === effective.backend ? effective.provider : undefined;
	const custom = hasLaunchOverride(value);
	const backendText = shownBackend
		? backendLabel(shownBackend)
		: role === 'exec'
			? 'Use overseer'
			: defaults.isLoading
				? '…'
				: 'Default';
	const summaryText = [backendText, shownModel, shownReasoningEffort].filter(Boolean).join(' · ');
	const provenance = custom
		? 'Custom override for this launch'
		: [
				`CLI ${value.backend ? 'set for this launch' : 'from config'}`,
				effective ? `model: ${modelSourceLabels[effective.modelSource] ?? ''}` : '',
				defaults.data?.projectConfigApplied ? 'project config applied' : '',
			]
				.filter(Boolean)
				.join(' · ');

	function update(patch: {
		backend?: BackendName | undefined;
		model?: string | undefined;
		reasoningEffort?: string | undefined;
	}): void {
		const merged = { ...value, ...patch };
		const next: LaunchTargetValue = {};
		if (merged.backend !== undefined) next.backend = merged.backend;
		if (merged.model) next.model = merged.model;
		if (merged.reasoningEffort) next.reasoningEffort = merged.reasoningEffort;
		onChange(next);
	}

	const chipButton = (
		<Tooltip
			content={
				<ExecutionIdentityDetails
					backend={shownBackend}
					hint={provenance || 'Launch target'}
					model={shownModel}
					provider={shownProvider}
					reasoningEffort={shownReasoningEffort}
				/>
			}>
			<button
				aria-controls={panelId}
				aria-expanded={open}
				aria-haspopup="dialog"
				className={cn(
					'inline-flex min-h-7 max-w-full flex-wrap items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs transition-colors',
					custom
						? 'border-teal-500 bg-teal-50 text-teal-900 dark:border-teal-500 dark:bg-teal-950/30 dark:text-teal-100'
						: 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:border-neutral-700',
					disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
				)}
				disabled={disabled}
				onClick={() => setOpen(true)}
				type="button">
				<Settings2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
				{role ? <span className="font-medium">{roleLabels[role]}:</span> : null}
				{shownBackend || shownModel || shownReasoningEffort ? (
					<ExecutionIdentityBadges
						backend={shownBackend}
						model={shownModel}
						provider={shownProvider}
						reasoningEffort={shownReasoningEffort}
						withTooltip={false}
					/>
				) : (
					<span className="truncate" title={summaryText}>
						{summaryText}
					</span>
				)}
				{custom ? <span className="font-medium">(custom)</span> : null}
			</button>
		</Tooltip>
	);

	const backendField = (
		<label className="space-y-1">
			<span className={fieldLabelClass}>{role ? `${roleLabels[role]} CLI` : 'CLI'}</span>
			<select
				className={`${selectClass} w-full`}
				disabled={disabled}
				onChange={(event) =>
					update({
						backend: event.target.value
							? (event.target.value as BackendName)
							: undefined,
					})
				}
				value={value.backend ?? ''}>
				<option value="">
					{role === 'exec' && !defaultBackend
						? 'Use overseer'
						: `Default (${defaultBackend ? backendLabel(defaultBackend) : '…'})`}
				</option>
				{backendOptions.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	);

	const modelField = (
		<label className="space-y-1">
			<span className={fieldLabelClass}>{role ? `${roleLabels[role]} model` : 'Model'}</span>
			<Input
				disabled={disabled}
				onChange={(event) => update({ model: event.target.value })}
				placeholder={defaultModel ? `Default (${defaultModel})` : 'Backend default'}
				value={value.model ?? ''}
			/>
		</label>
	);

	const effortField = !role ? (
		<label className="space-y-1">
			<span className={fieldLabelClass}>Effort</span>
			<select
				className={`${selectClass} w-full`}
				disabled={disabled}
				onChange={(event) => update({ reasoningEffort: event.target.value || undefined })}
				value={value.reasoningEffort ?? ''}>
				<option value="">
					Default{effective ? ` (${effective.reasoningEffort})` : ''}
				</option>
				{reasoningOptions.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
		</label>
	) : null;

	const resetButton = custom ? (
		<button
			className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
			onClick={() => onChange({})}
			type="button">
			<RotateCcw aria-hidden="true" className="h-3 w-3" />
			Reset to default
		</button>
	) : null;

	// The always-visible grid form used by the triumvirate role columns.
	if (variant === 'inline') {
		return (
			<div className="min-w-0 space-y-2">
				<div className="grid gap-2" id={panelId}>
					{backendField}
					{modelField}
					{effortField}
					{resetButton ? <div className="pt-1">{resetButton}</div> : null}
				</div>
			</div>
		);
	}

	return (
		<div className="min-w-0">
			{chipButton}
			<Dialog
				aria-labelledby={titleId}
				initialFocus="first"
				onClose={() => setOpen(false)}
				open={open}>
				<DialogPanel className="w-full max-w-md">
					<div className="space-y-5 p-5" id={panelId}>
						<div className="flex items-start gap-3">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-300">
								<Settings2 className="h-5 w-5" />
							</div>
							<div className="min-w-0">
								<h2
									className="text-base font-semibold text-foreground"
									id={titleId}>
									{role ? `${roleLabels[role]} launch target` : 'Launch target'}
								</h2>
								<p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
									{provenance ||
										'Choose the CLI, model, and effort for this launch.'}
								</p>
							</div>
						</div>
						<div className="space-y-4">
							{backendField}
							{modelField}
							{effortField}
						</div>
						<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div>{resetButton}</div>
							<Button onClick={() => setOpen(false)} variant="primary">
								Done
							</Button>
						</div>
					</div>
				</DialogPanel>
			</Dialog>
		</div>
	);
}

// Re-exported from its own module so existing import paths keep working.
export { LaunchTargetBadge } from './LaunchTargetBadge.tsx';

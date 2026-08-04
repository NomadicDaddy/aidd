import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { default as Settings2 } from 'lucide-react/dist/esm/icons/settings-2';
import { useId, useState } from 'react';

import type { BackendName, RunMode } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

import { useLaunchDefaults } from '../../hooks/useLaunchDefaults.ts';
import { backendOptions } from '../../lib/backends.ts';
import { cn } from '../../lib/cn.ts';
import { fieldLabelClass, selectClass } from '../../lib/formStyles.ts';
import { Button } from '../ui/button.tsx';
import { Dialog, DialogPanel } from '../ui/dialog.tsx';
import { Input } from '../ui/input.tsx';
import { Tooltip } from '../ui/tooltip.tsx';
import { ExecutionIdentityBadges, ExecutionIdentityDetails } from './ExecutionIdentityBadges.tsx';
import {
	type LaunchRole,
	launchTargetControlModel,
	type LaunchTargetDefaultScope,
	mergeLaunchTargetValue,
	reasoningOptions,
	roleLabels,
} from './launchTargetControlModel.ts';

export type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

export { LaunchTargetBadge } from './LaunchTargetBadge.tsx';
export type { LaunchRole } from './launchTargetControlModel.ts';

export interface LaunchTargetControlProps {
	defaultScope?: LaunchTargetDefaultScope;
	disabled?: boolean;
	label?: string;
	mode?: RunMode;
	onChange: (value: LaunchTargetValue) => void;
	projectDir?: string;
	role?: LaunchRole;
	value: LaunchTargetValue;
	variant?: 'chip' | 'inline';
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
	defaultScope = 'resolved',
	disabled,
	label,
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
	const display = launchTargetControlModel({
		defaultBackend,
		defaultModel,
		defaultProvider: effective?.provider,
		defaultReasoningEffort: effective?.reasoningEffort,
		defaultScope,
		isLoading: defaults.isLoading,
		modelSource: effective?.modelSource,
		projectConfigApplied: defaults.data?.projectConfigApplied ?? false,
		role,
		value,
	});

	function update(patch: {
		backend?: BackendName | undefined;
		model?: string | undefined;
		reasoningEffort?: string | undefined;
	}): void {
		onChange(mergeLaunchTargetValue(value, patch));
	}

	const chipButton = (
		<Tooltip
			content={
				<ExecutionIdentityDetails
					backend={display.shownBackend}
					hint={display.provenance || 'Launch target'}
					model={display.shownModel}
					provider={display.shownProvider}
					reasoningEffort={display.shownReasoningEffort}
				/>
			}>
			<button
				aria-controls={panelId}
				aria-expanded={open}
				aria-haspopup="dialog"
				className={cn(
					'inline-flex min-h-7 max-w-full flex-wrap items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs transition-colors',
					display.custom
						? 'border-accent bg-accent-muted text-accent-muted-foreground'
						: 'border-border bg-card text-muted-foreground hover:border-accent/40',
					disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
				)}
				disabled={disabled}
				onClick={() => setOpen(true)}
				type="button">
				<Settings2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
				{role || label ? (
					<span className="font-medium">{role ? roleLabels[role] : label}:</span>
				) : null}
				{display.shownBackend || display.shownModel || display.shownReasoningEffort ? (
					<ExecutionIdentityBadges
						backend={display.shownBackend}
						model={display.shownModel}
						provider={display.shownProvider}
						reasoningEffort={display.shownReasoningEffort}
						withTooltip={false}
					/>
				) : (
					<span className="truncate" title={display.summaryText}>
						{display.summaryText}
					</span>
				)}
				{display.custom ? <span className="font-medium">(custom)</span> : null}
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
				<option value="">{display.backendDefaultLabel}</option>
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
				placeholder={display.modelPlaceholder}
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
				<option value="">{display.effortDefaultLabel}</option>
				{reasoningOptions.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
		</label>
	) : null;

	const resetButton = display.custom ? (
		<button
			className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
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
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-accent-muted text-accent-muted-foreground">
								<Settings2 className="h-5 w-5" />
							</div>
							<div className="min-w-0">
								<h2
									className="text-base font-semibold text-foreground"
									id={titleId}>
									{role
										? `${roleLabels[role]} launch target`
										: label
											? `${label} launch target`
											: 'Launch target'}
								</h2>
								<p className="mt-1 text-sm text-muted-foreground">
									{display.provenance ||
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

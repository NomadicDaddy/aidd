import type { BackendName, ReasoningEffort } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

import { backendLabel } from '../../lib/backends.ts';

export type LaunchTargetDefaultScope = 'per-project' | 'resolved';
export type LaunchRole = 'exec' | 'overseer' | 'primary' | 'secondary';

export const reasoningOptions: ReasoningEffort[] = [
	'none',
	'minimal',
	'low',
	'medium',
	'high',
	'xhigh',
];

export const roleLabels: Record<LaunchRole, string> = {
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

export function hasLaunchOverride(value: LaunchTargetValue): boolean {
	return (
		value.backend !== undefined ||
		(value.model ?? '') !== '' ||
		(value.reasoningEffort ?? '') !== ''
	);
}

export function mergeLaunchTargetValue(
	value: LaunchTargetValue,
	patch: {
		backend?: BackendName | undefined;
		model?: string | undefined;
		reasoningEffort?: string | undefined;
	},
): LaunchTargetValue {
	const merged = { ...value, ...patch };
	const next: LaunchTargetValue = {};
	if (merged.backend !== undefined) next.backend = merged.backend;
	if (merged.model) next.model = merged.model;
	if (merged.reasoningEffort) next.reasoningEffort = merged.reasoningEffort;
	return next;
}

export function launchTargetControlModel(input: {
	defaultBackend: BackendName | undefined;
	defaultModel: string | undefined;
	defaultProvider: string | undefined;
	defaultReasoningEffort: string | undefined;
	defaultScope: LaunchTargetDefaultScope;
	isLoading: boolean;
	modelSource: string | undefined;
	projectConfigApplied: boolean;
	role: LaunchRole | undefined;
	value: LaunchTargetValue;
}) {
	const perProjectDefaults = input.defaultScope === 'per-project' && !input.role;
	const custom = hasLaunchOverride(input.value);
	const shownBackend = perProjectDefaults
		? input.value.backend
		: (input.value.backend ?? input.defaultBackend);
	const shownModel = perProjectDefaults
		? input.value.model
		: (input.value.model ?? '') !== ''
			? input.value.model
			: input.defaultModel;
	const shownReasoningEffort = perProjectDefaults
		? input.value.reasoningEffort
		: (input.value.reasoningEffort ?? input.defaultReasoningEffort);
	const shownProvider =
		!perProjectDefaults && shownBackend === input.defaultBackend
			? input.defaultProvider
			: undefined;
	const backendText = shownBackend
		? backendLabel(shownBackend)
		: input.role === 'exec'
			? 'Use overseer'
			: input.isLoading
				? '…'
				: 'Default';
	const summaryText = perProjectDefaults
		? custom
			? [
					shownBackend ? backendLabel(shownBackend) : undefined,
					shownModel,
					shownReasoningEffort,
				]
					.filter(Boolean)
					.join(' · ')
			: 'Per-project defaults'
		: [backendText, shownModel, shownReasoningEffort].filter(Boolean).join(' · ');
	const provenance = perProjectDefaults
		? custom
			? 'Custom values apply to every selected project; unset fields resolve per project'
			: 'Each selected project resolves its configured launch target'
		: custom
			? 'Custom override for this launch'
			: [
					`CLI ${input.value.backend ? 'set for this launch' : 'from config'}`,
					input.modelSource ? `model: ${modelSourceLabels[input.modelSource] ?? ''}` : '',
					input.projectConfigApplied ? 'project config applied' : '',
				]
					.filter(Boolean)
					.join(' · ');

	return {
		backendDefaultLabel: perProjectDefaults
			? 'Default (per project)'
			: input.role === 'exec' && !input.defaultBackend
				? 'Use overseer'
				: `Default (${input.defaultBackend ? backendLabel(input.defaultBackend) : '…'})`,
		custom,
		effortDefaultLabel: perProjectDefaults
			? 'Default (per project)'
			: `Default${input.defaultReasoningEffort ? ` (${input.defaultReasoningEffort})` : ''}`,
		modelPlaceholder: perProjectDefaults
			? 'Per-project default'
			: input.defaultModel
				? `Default (${input.defaultModel})`
				: 'Backend default',
		perProjectDefaults,
		provenance,
		shownBackend,
		shownModel,
		shownProvider,
		shownReasoningEffort,
		summaryText,
	};
}

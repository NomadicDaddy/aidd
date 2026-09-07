import type { BackendName, ReasoningEffort } from '../../api/types.ts';
import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';

import { backendLabel, providerLabel } from '../../lib/backends.ts';

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
	'backend-config': 'CLI default from config',
	'mode-config': 'mode default from config',
	override: 'custom override',
	'provider-default': 'provider default',
	'shared-config': 'shared default from config',
	unset: 'CLI decides',
};

export function launchTargetDefaultDisplay(input: {
	backend: BackendName | undefined;
	isLoading: boolean;
	model: string | undefined;
	modelSource: string | undefined;
	provider: string | undefined;
}) {
	const source = input.modelSource
		? (modelSourceLabels[input.modelSource] ?? 'resolved default')
		: input.isLoading
			? 'resolving provenance'
			: 'CLI decides';
	const backend = input.backend ? backendLabel(input.backend) : undefined;
	const provider =
		input.provider && input.provider !== input.backend ? input.provider : undefined;
	const route = [
		backend ? `CLI ${backend}` : undefined,
		provider ? `Provider ${providerLabel(provider)}` : undefined,
	]
		.filter(Boolean)
		.join(' · ');
	const resolvedModel = input.model ?? (input.isLoading ? undefined : 'CLI default');

	return {
		modelLabel: resolvedModel ?? 'CLI default',
		modelPlaceholder: input.isLoading
			? 'Resolving effective model…'
			: resolvedModel
				? `Effective (${resolvedModel})`
				: 'CLI default',
		modelProvenance: input.isLoading
			? 'Resolving effective model and provenance…'
			: [`Effective model: ${resolvedModel ?? 'CLI default'}`, source, route]
					.filter(Boolean)
					.join(' · '),
		modelSourceLabel: source,
	};
}

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
	const defaultDisplay = launchTargetDefaultDisplay({
		backend: input.defaultBackend,
		isLoading: input.isLoading,
		model: input.defaultModel,
		modelSource: input.modelSource,
		provider: input.defaultProvider,
	});
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
			? `Custom override for this launch · unset fields inherit ${defaultDisplay.modelProvenance.toLowerCase()}`
			: [
					`CLI ${input.value.backend ? 'set for this launch' : 'from config'}`,
					`model: ${defaultDisplay.modelSourceLabel}`,
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
			: defaultDisplay.modelPlaceholder,
		perProjectDefaults,
		provenance,
		shownBackend,
		shownModel,
		shownProvider,
		shownReasoningEffort,
		summaryText,
	};
}

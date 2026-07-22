import type { BackendName } from './skills.ts';

// Mirrors backend GET /api/v1/launch-defaults (backend/src/routes/launchDefaults.ts).
export type LaunchBackendSource = 'config' | 'override';

export type LaunchModelSource =
	'backend-config' | 'mode-config' | 'override' | 'provider-default' | 'shared-config' | 'unset';

export interface EffectiveLaunchTarget {
	backend: BackendName;
	backendSource: LaunchBackendSource;
	model: string | undefined;
	modelSource: LaunchModelSource;
	provider: string | undefined;
	reasoningEffort: string;
}

export interface LaunchRoleDefault {
	backend: BackendName | null;
	model: null | string;
}

export interface LaunchDefaults {
	effective: EffectiveLaunchTarget;
	projectConfigApplied: boolean;
	triumvirate: {
		exec: LaunchRoleDefault;
		overseer: LaunchRoleDefault;
		secondary: LaunchRoleDefault;
	};
}

// The user's optional per-launch override; undefined fields mean "use the resolved default".
export interface LaunchTargetValue {
	backend?: BackendName | undefined;
	model?: string | undefined;
	reasoningEffort?: string | undefined;
}

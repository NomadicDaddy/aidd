import type { EffectiveLaunchTarget } from '../plan/launch-target.ts';
import type { BackendName } from '../plan/types.ts';

/** One Triumvirate role's configured backend and model, null where the config says nothing. */
export interface LaunchRoleDefault {
	backend: BackendName | null;
	model: null | string;
}

/**
 * GET /api/v1/launch-defaults: what a launch would resolve to right now, user config overlaid with
 * the target project's .aidd/aidd.config.json. Shared so the backend route and the browser client
 * name one shape and check:api-types can hold them to it.
 */
export interface LaunchDefaults {
	effective: EffectiveLaunchTarget;
	projectConfigApplied: boolean;
	triumvirate: {
		exec: LaunchRoleDefault;
		overseer: LaunchRoleDefault;
		secondary: LaunchRoleDefault;
	};
}

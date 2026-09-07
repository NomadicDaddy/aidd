import type { LaunchTargetOverrides } from 'aidd-shared/plan/launch-target';

export function projectLaunchTarget(body: LaunchTargetOverrides): LaunchTargetOverrides {
	return {
		backend: body.backend,
		model: body.model,
		reasoningEffort: body.reasoningEffort,
	};
}

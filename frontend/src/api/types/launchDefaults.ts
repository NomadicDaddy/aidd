import type { BackendName } from './skills.ts';

// GET /api/v1/launch-defaults is one shared shape (aidd-shared/contracts/launch-defaults), not a
// mirror kept in step by hand; check:api-types holds this module to it.
// The browser reads only the whole response; the launch-target source unions and the role
// default live in aidd-shared for anything that needs them, and nothing here restates them.
export type { LaunchDefaults } from 'aidd-shared/contracts/launch-defaults';

// The user's optional per-launch override; undefined fields mean "use the resolved default".
export interface LaunchTargetValue {
	backend?: BackendName | undefined;
	model?: string | undefined;
	reasoningEffort?: string | undefined;
}

import type { PartialAiddConfig } from './schema.ts';
import type {
	ResolvedDirectorConfig,
	ResolvedDirectorSuggestionsAutoLaunchConfig,
} from './types.ts';

import {
	defaultDirectorAutoLaunchAllowedRecipes,
	defaultDirectorAutoLaunchEnabled,
	defaultDirectorAutoLaunchMaxPerCycle,
	defaultDirectorAutoLaunchMaxRank,
	defaultDirectorAutoLaunchRiskCeiling,
	defaultDirectorIntervalHours,
	defaultDirectorMaxPerBucket,
	defaultDirectorSuggestionGranularity,
} from './defaults.ts';

type PartialAutoLaunchConfig = NonNullable<
	NonNullable<PartialAiddConfig['director']>['suggestions']
>['autoLaunch'];

export function resolveDirectorConfig(
	director: PartialAiddConfig['director'],
): ResolvedDirectorConfig | undefined {
	if (!director) return undefined;
	return {
		chat: {
			allowFileEdits: director.chat?.allowFileEdits ?? false,
		},
		schedule: {
			enabled: director.schedule?.enabled ?? false,
			intervalHours: director.schedule?.intervalHours ?? defaultDirectorIntervalHours,
		},
		suggestions: {
			autoLaunch: resolveAutoLaunchConfig(director.suggestions?.autoLaunch),
			granularity: director.suggestions?.granularity ?? defaultDirectorSuggestionGranularity,
			maxPerBucket: director.suggestions?.maxPerBucket ?? defaultDirectorMaxPerBucket,
		},
	};
}

// Written out rather than folded into the object literal above so the default-off rule is one
// readable line: absent config, absent block, and an explicit `enabled: false` all land in the same
// place. A resolver that spread a partial over defaults could be made to resolve enabled:true from a
// config that never said so, which is the one outcome this feature may not have.
function resolveAutoLaunchConfig(
	autoLaunch: PartialAutoLaunchConfig,
): ResolvedDirectorSuggestionsAutoLaunchConfig {
	return {
		allowedRecipes: autoLaunch?.allowedRecipes ?? defaultDirectorAutoLaunchAllowedRecipes,
		enabled: autoLaunch?.enabled ?? defaultDirectorAutoLaunchEnabled,
		maxPerCycle: autoLaunch?.maxPerCycle ?? defaultDirectorAutoLaunchMaxPerCycle,
		maxRank: autoLaunch?.maxRank ?? defaultDirectorAutoLaunchMaxRank,
		riskCeiling: autoLaunch?.riskCeiling ?? defaultDirectorAutoLaunchRiskCeiling,
	};
}

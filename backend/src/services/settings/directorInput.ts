import {
	defaultDirectorAutoLaunchAllowedRecipes,
	defaultDirectorAutoLaunchEnabled,
	defaultDirectorAutoLaunchMaxPerCycle,
	defaultDirectorAutoLaunchMaxRank,
	defaultDirectorAutoLaunchRiskCeiling,
	defaultDirectorMaxPerBucket,
	defaultDirectorSuggestionGranularity,
	type PartialAiddConfig,
} from 'aidd-shared/config';

import type { WebConfigSettingsInput } from './types.ts';

import { cleanList } from './normalization.ts';

// Its own module because the director block is the one settings section whose fields are bounds:
// each has to be carried forward from disk when the request omits it, which is several times more
// code than the flat copy-the-value shape the rest of buildUpdatedConfig is made of.
export function applyDirectorInput(
	next: PartialAiddConfig,
	existing: PartialAiddConfig,
	input: WebConfigSettingsInput,
): void {
	const allowFileEdits =
		'directorChatAllowFileEdits' in input
			? input.directorChatAllowFileEdits === true
			: (existing.director?.chat?.allowFileEdits ?? false);
	const granularity =
		'directorSuggestionGranularity' in input &&
		input.directorSuggestionGranularity !== undefined
			? input.directorSuggestionGranularity
			: (existing.director?.suggestions?.granularity ?? defaultDirectorSuggestionGranularity);
	const rawMaxPerBucket = input.directorSuggestionMaxPerBucket;
	const maxPerBucket =
		typeof rawMaxPerBucket === 'number' &&
		Number.isFinite(rawMaxPerBucket) &&
		rawMaxPerBucket > 0
			? Math.floor(rawMaxPerBucket)
			: (existing.director?.suggestions?.maxPerBucket ?? defaultDirectorMaxPerBucket);
	// Persist the full director block unconditionally, like every other settings field —
	// values are written even when they equal their defaults so nothing silently vanishes
	// from config.json on save. `resolveMergedConfig` fills the same defaults on read, so
	// this is purely about a stable, non-disappearing on-disk representation.
	//
	// `schedule` is deliberately not written back. The cycle cadence lives on the built-in
	// scheduled task, and the config keys are read exactly once to seed it, so the first save
	// drops them from config.json. Seeding runs at boot before any save can happen.
	next.director = {
		chat: { allowFileEdits },
		suggestions: { autoLaunch: autoLaunchInput(existing, input), granularity, maxPerBucket },
	};
}

// The bounds on the Director launching its own suggestions. Each is carried forward from what is
// already on disk when the request does not mention it, so a client that posts a partial settings
// body cannot switch auto-launch on, or widen a ceiling, by omission.
function autoLaunchInput(
	existing: PartialAiddConfig,
	input: WebConfigSettingsInput,
): NonNullable<NonNullable<PartialAiddConfig['director']>['suggestions']>['autoLaunch'] {
	const stored = existing.director?.suggestions?.autoLaunch;
	return {
		// An empty array is a real answer — 'plain runs only' — so it is taken as sent rather than
		// falling through to the stored list the way a missing key does.
		allowedRecipes: Array.isArray(input.directorAutoLaunchAllowedRecipes)
			? cleanList(input.directorAutoLaunchAllowedRecipes)
			: (stored?.allowedRecipes ?? [...defaultDirectorAutoLaunchAllowedRecipes]),
		enabled:
			'directorAutoLaunchEnabled' in input
				? input.directorAutoLaunchEnabled === true
				: (stored?.enabled ?? defaultDirectorAutoLaunchEnabled),
		maxPerCycle: positiveCount(
			input.directorAutoLaunchMaxPerCycle,
			stored?.maxPerCycle ?? defaultDirectorAutoLaunchMaxPerCycle,
		),
		maxRank: positiveCount(
			input.directorAutoLaunchMaxRank,
			stored?.maxRank ?? defaultDirectorAutoLaunchMaxRank,
		),
		riskCeiling:
			input.directorAutoLaunchRiskCeiling ??
			stored?.riskCeiling ??
			defaultDirectorAutoLaunchRiskCeiling,
	};
}

// A ceiling only means something as a whole number above zero, and a rejected value falls back to
// what was already stored rather than to the default: an operator who set 3 and then sent junk gets
// 3 back, not a silent tightening they did not ask for.
function positiveCount(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0
		? Math.floor(value)
		: fallback;
}

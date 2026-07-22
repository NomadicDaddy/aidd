import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { RunMode } from '../api/types.ts';

import { getLaunchDefaults } from '../api/launchDefaults.ts';

// Resolved backend/model/effort a launch would use right now (project config overlaid on
// global config, mode-aware). Displayed by LaunchTargetControl so every launch surface
// shows the truth rather than a guess. ~30s staleness is acceptable: settings saves
// invalidate ['launch-defaults'] explicitly, so only out-of-band project-config edits
// wait for the refetch.
export function useLaunchDefaults(projectDir?: string, mode?: RunMode) {
	return useQuery({
		placeholderData: keepPreviousData,
		queryFn: () => getLaunchDefaults(projectDir, mode),
		queryKey: ['launch-defaults', projectDir ?? null, mode ?? 'coding'],
		staleTime: 30_000,
	});
}

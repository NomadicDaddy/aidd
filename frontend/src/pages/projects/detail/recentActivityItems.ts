import { type ActivityEntry, recentActivityEntries } from 'aidd-shared/runs/activity';

import type { GitCommitRef, ProjectLocalIteration, ProjectLocalRun } from '../../../api/types.ts';

import { formatDuration } from '../../../lib/formatters.ts';

/**
 * A timeline entry with this surface's formatting applied.
 *
 * Everything semantic — ordering, the run-status derivation, the status labels, the execution
 * identity, the iteration/run dedupe — comes from `aidd-shared/runs/activity`, which the
 * Dashboard's server-side projection reads too. What is added here is presentation: the rendered
 * duration and the detail line it sits on. See the module comment in the shared file for why the
 * split falls there.
 */
export interface RecentMetadataActivityItem extends Omit<ActivityEntry, 'commits'> {
	commits: GitCommitRef[];
	detailParts: string[];
	duration: null | string;
}

function present(entry: ActivityEntry): RecentMetadataActivityItem {
	const duration = entry.durationMs ? formatDuration(entry.durationMs) : null;
	return {
		...entry,
		detailParts: [entry.sourceLabel, duration].filter((part): part is string => part !== null),
		duration,
	};
}

export function recentMetadataActivity(
	localRuns: ProjectLocalRun[],
	localIterations: ProjectLocalIteration[],
): RecentMetadataActivityItem[] {
	return recentActivityEntries(localRuns, localIterations).map((entry) => present(entry));
}

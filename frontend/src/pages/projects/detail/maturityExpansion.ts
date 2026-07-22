import type { MaturityStage } from '../../../api/types.ts';

export function defaultExpandedMaturityStageIds(
	stages: readonly MaturityStage[]
): ReadonlySet<string> {
	const current = stages.find((stage) => stage.status !== 'complete');
	return current ? new Set([current.id]) : new Set();
}

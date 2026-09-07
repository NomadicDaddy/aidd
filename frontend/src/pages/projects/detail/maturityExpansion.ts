import type { MaturityStage } from '../../../api/types.ts';

export function defaultExpandedMaturityStageIds(
	_stages: readonly MaturityStage[],
): ReadonlySet<string> {
	return new Set();
}

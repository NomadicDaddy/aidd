import type { AiddStore } from 'aidd-shared/metadata/store';
import type { StopPolicy } from 'aidd-shared/plan/types';

/** A run stops for its own signal or for the explicit project-wide CLI/Ctrl+C signal. */
export async function hasStopRequested(
	store: Pick<AiddStore, 'hasStopRequested'>,
	policy: Pick<StopPolicy, 'projectStopFile' | 'stopFile'>,
): Promise<boolean> {
	if (await store.hasStopRequested(policy.stopFile)) return true;
	return policy.projectStopFile !== policy.stopFile
		? await store.hasStopRequested(policy.projectStopFile)
		: false;
}

import type { Feature } from 'aidd-shared/metadata/features';

import { unsatisfiedDependencies } from 'aidd-shared/metadata/features/query';

/**
 * The fields the launch rule reads, kept structural so every feature surface can pass its own row:
 * the Features tab holds API DTOs and the Dependencies tab holds graph nodes, and both widen
 * `passes` to null where the record uses a plain boolean.
 */
interface FeatureLaunchState {
	dependencies?: string[] | undefined;
	directory?: null | string | undefined;
	id?: null | string | undefined;
	passes?: boolean | null | undefined;
	status?: null | string | undefined;
}

export interface FeatureLaunchGate {
	/** Declared dependencies that are not complete, named as the record declares them. */
	blockedBy: string[];
	canLaunch: boolean;
}

/** True when `passes` contradicts the canonical completed + passing state. */
export function featurePassesDisagrees(feature: FeatureLaunchState, status: string): boolean {
	if (status === 'completed') return feature.passes !== true;
	return feature.passes === true;
}

// Only the fields the shared rule reads are carried across, so a surface's row shape cannot smuggle
// a difference into a decision the runtime makes about the record on disk.
function asFeature(feature: FeatureLaunchState): Feature {
	const record: Feature = { id: feature.id ?? '' };
	if (feature.dependencies) record.dependencies = feature.dependencies;
	if (typeof feature.directory === 'string') record.directory = feature.directory;
	if (typeof feature.passes === 'boolean') record.passes = feature.passes;
	if (typeof feature.status === 'string') record.status = feature.status;
	return record;
}

/**
 * Whether a feature can launch a run, and what is stopping it when it cannot.
 *
 * Status alone was the old answer, and it disagreed with the runtime: `selectFeatureCandidates`
 * also skips a feature whose declared dependencies are not all complete, so a control the operator
 * could press produced a run that immediately declined to pick the feature up. The dependency half
 * is the shared `unsatisfiedDependencies` rule that selection itself filters on, not a second
 * implementation of it, so the two cannot drift apart.
 *
 * `blockedBy` is what makes the refusal explainable: a disabled control that will not say what it
 * is waiting on reads as broken. `inventory` must be every feature the project has — a dependency
 * absent from it counts as unsatisfied, which is the honest answer for an incomplete list and the
 * wrong one for a filtered slice.
 */
export function featureLaunchGate(
	feature: FeatureLaunchState,
	inventory: FeatureLaunchState[],
): FeatureLaunchGate {
	const status = typeof feature.status === 'string' ? feature.status.trim() : '';
	const statusAllows =
		(status === 'backlog' || status === 'in_progress') &&
		!featurePassesDisagrees(feature, status);
	const blockedBy = unsatisfiedDependencies(asFeature(feature), inventory.map(asFeature));
	return { blockedBy, canLaunch: statusAllows && blockedBy.length === 0 };
}

/** One launch-eligibility rule for every project-detail feature surface. */
export function featureCanLaunchRun(
	feature: FeatureLaunchState,
	inventory: FeatureLaunchState[],
): boolean {
	return featureLaunchGate(feature, inventory).canLaunch;
}

/** The title a blocked launch control carries, so the prerequisite is nameable from the node. */
export function featureLaunchBlockedTitle(blockedBy: string[]): string {
	return `Cannot launch: waiting on ${blockedBy.join(', ')}`;
}

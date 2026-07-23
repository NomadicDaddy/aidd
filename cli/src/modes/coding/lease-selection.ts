import type { FeatureLeaseRecord } from 'aidd-shared/metadata/feature-leases';
import type { ModeContext, SelectedWork } from 'aidd-shared/modes/types';

import { type Feature, type FeatureSelectionOptions } from 'aidd-shared/metadata/features';
import { selectFeatureCandidates } from 'aidd-shared/metadata/features';

interface LeaseSkip {
	featureId: string;
	holder: FeatureLeaseRecord | null;
}

export interface LeaseAwareSelection {
	/** Every eligible candidate is leased by another live run: a no-work result explaining the
	 * exhaustion. For an explicit feature target this is a per-feature refusal naming the
	 * holder, surfaced as a blocked stop (see noWorkStopReason). */
	leaseBlocked?: SelectedWork;
	selected?: Feature;
}

/** Walk the ranked selection candidates and claim the first one whose cross-run lease this run
 * can hold. Two concurrent runs against one project therefore cannot pick the same feature: the
 * loser of the exclusive-create race skips to the next eligible candidate. Without a lease
 * service (non-coding entry points, tests) the ranked winner is returned untouched. Reentrant
 * across iterations — the run's own lease from a prior iteration acquires again. */
export async function selectLeasableFeature(input: {
	context: ModeContext;
	explicitTarget: string | undefined;
	features: Feature[];
	options: FeatureSelectionOptions;
	totalCandidates: number;
}): Promise<LeaseAwareSelection> {
	const candidates = selectFeatureCandidates(input.features, input.options);
	const leases = input.context.featureLeases;
	if (!leases) {
		const [first] = candidates;
		return first ? { selected: first } : {};
	}
	const skipped: LeaseSkip[] = [];
	for (const candidate of candidates) {
		const featureId = candidate.directory ?? candidate.id;
		const attempt = await leases.acquire(featureId);
		if (attempt.acquired) return { selected: candidate };
		skipped.push({ featureId, holder: attempt.holder });
	}
	if (skipped.length === 0) return {};
	return {
		leaseBlocked: leaseBlockedNoWork(input.explicitTarget, skipped, input.totalCandidates),
	};
}

function leaseBlockedNoWork(
	explicitTarget: string | undefined,
	skipped: LeaseSkip[],
	totalCandidates: number
): SelectedWork {
	const target =
		explicitTarget !== undefined
			? skipped.find((entry) => entry.featureId === explicitTarget)
			: undefined;
	if (explicitTarget !== undefined && target !== undefined) {
		const holderRun = target.holder?.runId;
		const holderText =
			holderRun !== undefined
				? `live run '${holderRun}'${target.holder ? ` (pid ${target.holder.pid})` : ''}`
				: 'another live run';
		return {
			data: {
				leaseHolderRunId: holderRun ?? null,
				requestedFeature: explicitTarget,
				totalCandidates,
			},
			description: `Feature '${explicitTarget}' is leased by concurrent ${holderText}; wait for that run to finish (or stop it) before relaunching this feature`,
			id: 'no-work',
			kind: 'none',
		};
	}
	return {
		data: {
			leasedFeatures: skipped.map((entry) => entry.featureId),
			totalCandidates,
		},
		description: `No claimable coding features: ${skipped.length} eligible feature(s) are leased by concurrent live runs`,
		id: 'no-work',
		kind: 'none',
	};
}

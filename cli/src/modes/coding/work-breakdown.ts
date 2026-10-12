import {
	dependenciesAreSatisfied,
	type Feature,
	isAuditFinding,
	isFeatureOutstanding,
} from 'aidd-shared/metadata/features';

export interface FeatureWorkBreakdown {
	dependencyBlocked: number;
	eligible: number;
	incoherentPassing: string[];
	pendingApproval: number;
	remaining: number;
}

export function featureWorkBreakdown(
	features: Feature[],
	allFeatures: Feature[],
	includeAudit: boolean,
): FeatureWorkBreakdown {
	// Deferred records are not remaining work: they are neither eligible nor waiting on anyone.
	const remainingFeatures = features.filter(
		(feature) => isFeatureOutstanding(feature) && feature.status !== 'completed',
	);
	const incoherentPassing = features
		.filter((feature) => feature.passes === true && feature.status !== 'completed')
		.map((feature) => feature.directory ?? feature.id)
		.sort();
	const pendingApproval = remainingFeatures.filter(
		(feature) => feature.status === 'waiting_approval',
	);
	const otherwiseEligible = remainingFeatures
		.filter((feature) => feature.status !== 'waiting_approval')
		.filter((feature) => includeAudit || !isAuditFinding(feature));
	const dependencyBlocked = otherwiseEligible.filter(
		(feature) => !dependenciesAreSatisfied(feature, allFeatures),
	);
	return {
		dependencyBlocked: dependencyBlocked.length,
		eligible: otherwiseEligible.length - dependencyBlocked.length,
		incoherentPassing,
		pendingApproval: pendingApproval.length,
		remaining: remainingFeatures.length,
	};
}

function incoherentPassingDescription(featureIds: string[]): string {
	return `Feature metadata is incoherent and cannot be selected: ${featureIds.join(', ')} (passes=true with a non-completed status)`;
}

export function noWorkDescription(breakdown: FeatureWorkBreakdown): string {
	if (breakdown.incoherentPassing.length > 0)
		return incoherentPassingDescription(breakdown.incoherentPassing);
	if (
		breakdown.pendingApproval > 0 &&
		breakdown.eligible === 0 &&
		breakdown.dependencyBlocked === 0
	) {
		return `No approved incomplete coding features are available; ${breakdown.pendingApproval} feature(s) are pending approval`;
	}
	if (breakdown.dependencyBlocked > 0) {
		const pendingSuffix =
			breakdown.pendingApproval > 0
				? `; ${breakdown.pendingApproval} feature(s) are pending approval`
				: '';
		return `No eligible incomplete coding features are available; ${breakdown.dependencyBlocked} feature(s) are dependency-blocked${pendingSuffix}`;
	}
	return 'No incomplete coding features are available';
}

export function noWorkSummary(breakdown: FeatureWorkBreakdown): string {
	if (breakdown.incoherentPassing.length > 0)
		return incoherentPassingDescription(breakdown.incoherentPassing);
	if (breakdown.remaining === 0) return 'coding has no incomplete feature work';
	if (
		breakdown.pendingApproval > 0 &&
		breakdown.eligible === 0 &&
		breakdown.dependencyBlocked === 0
	) {
		return `coding has no approved incomplete feature work; ${breakdown.pendingApproval} feature(s) pending approval`;
	}
	if (breakdown.dependencyBlocked > 0) {
		const pendingSuffix =
			breakdown.pendingApproval > 0
				? `; ${breakdown.pendingApproval} feature(s) pending approval`
				: '';
		return `coding has no eligible incomplete feature work; ${breakdown.dependencyBlocked} feature(s) dependency-blocked${pendingSuffix}`;
	}
	return 'coding has no incomplete feature work';
}

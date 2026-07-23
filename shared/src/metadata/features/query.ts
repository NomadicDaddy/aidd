import {
	type Feature,
	type FeatureQuery,
	type FeatureSelectionOptions,
	type FeatureStats,
	type FeatureStatusType,
} from './types.ts';

export function featureMatchesQuery(feature: Feature, query: FeatureQuery = {}): boolean {
	const directory = feature.directory ?? feature.id;
	if (!query.includeAudit && isAuditFinding(feature)) return false;
	if (query.featureDirectory && directory !== query.featureDirectory) return false;
	if (
		query.milestoneFeatureDirectories &&
		query.milestoneFeatureDirectories.length > 0 &&
		!query.milestoneFeatureDirectories.includes(directory)
	) {
		return false;
	}
	for (const filter of query.filters ?? []) {
		const actual = feature[filter.field];
		if (!valueMatchesFilter(actual, filter.value)) return false;
	}
	return true;
}

export function isAuditFinding(feature: Feature): boolean {
	const id = feature.directory ?? feature.id;
	return Boolean(feature.auditSource) || /^audit-[a-z][a-z0-9-]*-\d+-/.test(id);
}

export function isRemediationFeature(feature: Feature): boolean {
	const id = feature.directory ?? feature.id;
	return /^remediation(-\d+)?-[a-zA-Z0-9-]+$/.test(id);
}

export function classifyFeatureStatusType(feature: Feature): FeatureStatusType {
	if (isAuditFinding(feature)) return 'audit';
	if (isRemediationFeature(feature)) return 'remediation';
	return 'feature';
}

function valueMatchesFilter(actual: unknown, expected: string): boolean {
	if (Array.isArray(actual)) {
		return actual.some((value) => valueMatchesFilter(value, expected));
	}
	const actualString = String(actual ?? '');
	if (!expected.includes('*')) return actualString === expected;
	const pattern = new RegExp(`^${escapeRegExp(expected).replaceAll('\\*', '.*')}$`);
	return pattern.test(actualString);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function summarizeFeatures(features: Feature[]): FeatureStats {
	const stats: FeatureStats = {
		byCategoryPriority: [],
		closed: features.filter((feature) => feature.status === 'completed').length,
		failing: features.filter(
			(feature) => feature.passes === false && feature.status === 'backlog'
		).length,
		open: features.filter((feature) => feature.status === 'backlog').length,
		passing: features.filter((feature) => feature.passes === true).length,
		total: features.length,
		waitingApproval: features.filter((feature) => feature.status === 'waiting_approval').length,
	};
	const buckets = new Map<string, FeatureStats['byCategoryPriority'][number]>();
	for (const feature of features) {
		const category = feature.category;
		if (!category) continue;
		const bucket = buckets.get(category) ?? { category, p1: 0, p2: 0, p3: 0, p4: 0, total: 0 };
		bucket.total++;
		const priority = Number(feature.priority);
		if (priority === 1) bucket.p1++;
		if (priority === 2) bucket.p2++;
		if (priority === 3) bucket.p3++;
		if (priority === 4) bucket.p4++;
		buckets.set(category, bucket);
	}
	stats.byCategoryPriority = [...buckets.values()].sort((a, b) =>
		a.category.localeCompare(b.category)
	);
	return stats;
}

/** Full selection ranking (in_progress first, then priority, then id) with every ineligible
 * feature filtered out. Exposed so lease-aware selection can walk past candidates leased by a
 * concurrent run instead of only ever seeing the single top pick. */
export function selectFeatureCandidates(
	features: Feature[],
	options: FeatureSelectionOptions = {}
): Feature[] {
	const allFeatures = options.allFeatures ?? features;
	return features
		.filter((feature) => feature.passes !== true)
		.filter((feature) => feature.status !== 'waiting_approval')
		.filter((feature) => options.includeAudit || !isAuditFinding(feature))
		.filter((feature) => dependenciesAreSatisfied(feature, allFeatures))
		.sort((a, b) => {
			const statusRank = (value: Feature) => (value.status === 'in_progress' ? 0 : 1);
			const priority = (value: Feature) => Number(value.priority ?? 999);
			return (
				statusRank(a) - statusRank(b) ||
				priority(a) - priority(b) ||
				(a.directory ?? a.id).localeCompare(b.directory ?? b.id)
			);
		});
}

export function selectNextFeature(
	features: Feature[],
	options: FeatureSelectionOptions = {}
): Feature | undefined {
	return selectFeatureCandidates(features, options)[0];
}

export function dependenciesAreSatisfied(feature: Feature, allFeatures: Feature[]): boolean {
	const dependencies = feature.dependencies ?? [];
	if (dependencies.length === 0) return true;
	const byId = new Map<string, Feature>();
	for (const candidate of allFeatures) {
		byId.set(candidate.id, candidate);
		if (candidate.directory) byId.set(candidate.directory, candidate);
	}
	return dependencies.every((dependencyId) => byId.get(dependencyId)?.passes === true);
}

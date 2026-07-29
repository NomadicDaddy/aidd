import type { ProjectFeature, ProjectRoadmapSummary } from '../../../api/types.ts';

import { stringValue } from './shared.ts';

export const FEATURE_STATUS_OPTIONS = [
	'backlog',
	'in_progress',
	'waiting_approval',
	'completed',
] as const;

export type FeatureStatusFilter = 'all' | 'incomplete' | (typeof FEATURE_STATUS_OPTIONS)[number];

export const FEATURE_STATUS_FILTER_OPTIONS: FeatureStatusFilter[] = [
	'all',
	'incomplete',
	...FEATURE_STATUS_OPTIONS,
];

export const FEATURE_FILTER_PARAMS = [
	'featureQ',
	'featureStatus',
	'featureMilestone',
	'featureSource',
];

export const UNASSIGNED_MILESTONE = '__unassigned';

export function withUnassignedMilestoneFilter(searchParams: URLSearchParams): URLSearchParams {
	const next = new URLSearchParams(searchParams);
	next.set('featureMilestone', UNASSIGNED_MILESTONE);
	return next;
}

export const FEATURE_METADATA_KEYS = [
	'directory',
	'id',
	'status',
	'milestone',
	'passes',
	'priority',
	'category',
	'auditSource',
	'auditSeverity',
	'shippedVersion',
	'createdAt',
	'updatedAt',
	'justFinishedAt',
];

export function featureDirectory(feature: ProjectFeature): string {
	return feature.directory || feature.id;
}

// Reverse dependency edges: which features declare a dependency ON this one. Deps are written by
// either id or directory (and derived projects have id !== directory), so both names must match —
// the same dual-key rule the CLI's dependency resolver uses. Returned as canonical directory names
// so the values line up with what the dependency graph and the Features table display.
export function featureDependents(feature: ProjectFeature, features: ProjectFeature[]): string[] {
	const names = new Set([feature.id, featureDirectory(feature)].filter(Boolean));
	const self = featureDirectory(feature);
	const dependents = new Set<string>();
	for (const candidate of features) {
		const candidateDirectory = featureDirectory(candidate);
		if (candidateDirectory === self) continue;
		if (!Array.isArray(candidate.dependencies)) continue;
		const matches = candidate.dependencies.some(
			(dependency) => typeof dependency === 'string' && names.has(dependency.trim()),
		);
		if (matches) dependents.add(candidateDirectory);
	}
	return [...dependents].sort((left, right) => left.localeCompare(right));
}

export function displayValue(value: unknown): string {
	if (value === null || value === undefined || value === '') return '—';
	if (typeof value === 'boolean') return value ? 'yes' : 'no';
	if (typeof value === 'number') return String(value);
	if (typeof value === 'string') return value;
	return JSON.stringify(value, null, 2);
}

export function textBlockValue(value: unknown): string {
	if (typeof value === 'string') return value.trim();
	if (Array.isArray(value)) return value.map(displayValue).join('\n').trim();
	if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
	return '';
}

export function listValue(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map(displayValue).filter((item) => item !== '—');
}

function normalizedSearchValue(value: unknown): string {
	return displayValue(value).toLowerCase();
}

export function featureMatchesSearch(feature: ProjectFeature, query: string): boolean {
	const trimmed = query.trim().toLowerCase();
	if (!trimmed) return true;
	const searchableFields = [
		featureDirectory(feature),
		feature.id,
		feature.title,
		feature.description,
		feature.category,
		feature.auditSource,
		feature.auditSeverity,
		feature.spec,
	];
	return searchableFields.some((value) => normalizedSearchValue(value).includes(trimmed));
}

export type SourceCategory = 'audit' | 'feature' | 'remediation';

export const SOURCE_AGGREGATE_ALL_FEATURES = '__all_features';
export const SOURCE_AGGREGATE_ALL_AUDITS = '__all_audits';
export const SOURCE_AGGREGATE_ALL_REMEDIATIONS = '__all_remediations';

export function featureSourceLabel(feature: ProjectFeature): string {
	const auditSource = stringValue(feature, 'auditSource');
	const category = stringValue(feature, 'category');
	if (featureDirectory(feature).startsWith('remediation-')) return 'Remediation';
	if (auditSource) return `Audit: ${auditSource}`;
	if (category) return `Feature: ${category}`;
	return 'Feature backlog';
}

/** The version a completed feature shipped in; null for incomplete features (a stale
 *  `shippedVersion` from an earlier completion says nothing about the in-flight revision). */
export function featureShippedVersion(feature: ProjectFeature): null | string {
	if (stringValue(feature, 'status') !== 'completed') return null;
	return stringValue(feature, 'shippedVersion') || null;
}

export function sourceLabelCategory(label: string): SourceCategory {
	if (label === 'Remediation') return 'remediation';
	if (label.startsWith('Audit:')) return 'audit';
	return 'feature';
}

export function featureMatchesSourceFilter(feature: ProjectFeature, filter: string): boolean {
	if (filter === 'all') return true;
	const category = sourceLabelCategory(featureSourceLabel(feature));
	if (filter === SOURCE_AGGREGATE_ALL_FEATURES) return category === 'feature';
	if (filter === SOURCE_AGGREGATE_ALL_AUDITS) return category === 'audit';
	if (filter === SOURCE_AGGREGATE_ALL_REMEDIATIONS) return category === 'remediation';
	return featureSourceLabel(feature) === filter;
}

export function isKnownStatusFilter(value: string): value is FeatureStatusFilter {
	return (FEATURE_STATUS_FILTER_OPTIONS as string[]).includes(value);
}

export interface FeatureVisibilityFilters {
	milestoneFilter: string;
	query: string;
	sourceFilter: string;
	statusFilter: string;
}

// One rule set for feature visibility, shared by the Features tab and the dependency
// graph so both surfaces filter identically.
export function featureMatchesFilters(
	feature: ProjectFeature,
	filters: FeatureVisibilityFilters,
): boolean {
	if (!featureMatchesSearch(feature, filters.query)) return false;
	const status = stringValue(feature, 'status') || 'unknown';
	if (filters.statusFilter === 'incomplete' && status === 'completed') return false;
	if (
		filters.statusFilter !== 'all' &&
		filters.statusFilter !== 'incomplete' &&
		status !== filters.statusFilter
	) {
		return false;
	}
	const milestone = typeof feature.milestone === 'string' ? feature.milestone : '';
	if (filters.milestoneFilter === UNASSIGNED_MILESTONE && milestone) return false;
	if (
		filters.milestoneFilter !== 'all' &&
		filters.milestoneFilter !== UNASSIGNED_MILESTONE &&
		milestone !== filters.milestoneFilter
	) {
		return false;
	}
	return (
		filters.sourceFilter === 'all' || featureMatchesSourceFilter(feature, filters.sourceFilter)
	);
}

export function sortedSourceOptions(
	features: ProjectFeature[],
): { label: string; value: string }[] {
	const labels = new Set(features.map(featureSourceLabel));
	const options: { label: string; value: string }[] = [];
	const byCategory = new Map<SourceCategory, number>();
	for (const label of labels) {
		const cat = sourceLabelCategory(label);
		byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
	}
	if ((byCategory.get('feature') ?? 0) > 1) {
		options.push({ label: 'All Features', value: SOURCE_AGGREGATE_ALL_FEATURES });
	}
	if ((byCategory.get('audit') ?? 0) > 1) {
		options.push({ label: 'All Audits', value: SOURCE_AGGREGATE_ALL_AUDITS });
	}
	if ((byCategory.get('remediation') ?? 0) > 1) {
		options.push({ label: 'All Remediations', value: SOURCE_AGGREGATE_ALL_REMEDIATIONS });
	}
	options.push(
		...[...labels]
			.sort((left, right) => left.localeCompare(right))
			.map((label) => ({ label, value: label })),
	);
	return options;
}

export function milestoneFilterOptions(
	features: ProjectFeature[],
	roadmap: null | ProjectRoadmapSummary,
): { label: string; value: string }[] {
	const options: { label: string; value: string }[] = [];
	const roadmapOrder = roadmap?.milestoneOrder ?? Object.keys(roadmap?.milestones ?? {});
	for (const milestone of roadmapOrder) {
		options.push({ label: milestone, value: milestone });
	}
	const known = new Set(roadmapOrder);
	const extra = new Set<string>();
	let hasUnassigned = false;
	for (const feature of features) {
		const milestone = typeof feature.milestone === 'string' ? feature.milestone : '';
		if (!milestone) {
			hasUnassigned = true;
			continue;
		}
		if (!known.has(milestone)) extra.add(milestone);
	}
	for (const milestone of [...extra].sort((left, right) => left.localeCompare(right))) {
		options.push({ label: `Invalid: ${milestone}`, value: milestone });
	}
	if (hasUnassigned || (roadmap?.unmappedFeatureDirectories.length ?? 0) > 0) {
		options.push({ label: 'Unassigned', value: UNASSIGNED_MILESTONE });
	}
	return options;
}

// Roadmap-gate callout data: feature directories with no milestone (which hard-block coding
// selection) plus invalid milestone references. Null when the roadmap has no gate problems —
// the Features tab renders nothing in that case.
export function unmappedRoadmapCallout(roadmap: null | ProjectRoadmapSummary): {
	invalid: { featureDirectory: string; milestone: string }[];
	names: string[];
} | null {
	if (!roadmap) return null;
	const names = roadmap.unmappedFeatureDirectories;
	const invalid = roadmap.invalidMappings;
	if (names.length === 0 && invalid.length === 0) return null;
	return { invalid, names };
}

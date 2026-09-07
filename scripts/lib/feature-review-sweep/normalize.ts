import {
	CANONICAL_KEY_ORDER,
	COMPLETED_STATUSES,
	REQUIRED_FIELDS,
	VALID_STATUSES,
} from './constants.ts';
import {
	type FeatureJson,
	type NormalizeContext,
	type NormalizeResult,
	type SchemaAnalysis,
} from './types.ts';
import { hasOwn, uniqueValues } from './util.ts';

function trimStringFields(feature: FeatureJson): void {
	const keys = [
		'id',
		'title',
		'description',
		'category',
		'status',
		'spec',
		'auditSource',
		'auditSeverity',
		'verificationEvidence',
	];

	for (const key of keys) {
		const value = feature[key];
		if (typeof value === 'string') {
			feature[key] = value.trim();
		}
	}
}

function canonicalizeDependencies(rawDependencies: unknown): unknown[] {
	if (rawDependencies === undefined || rawDependencies === null || rawDependencies === '') {
		return [];
	}
	if (Array.isArray(rawDependencies)) {
		return rawDependencies.filter((entry) => entry !== null && entry !== undefined);
	}
	if (typeof rawDependencies === 'string') {
		return [rawDependencies];
	}
	return [];
}

function normalizeDependency(dep: unknown): string {
	return typeof dep === 'string' ? dep.trim() : '';
}

function maybeBackfillVerificationEvidence(
	feature: FeatureJson,
	context: NormalizeContext,
	manualFollowUps: string[],
	actions: string[],
): void {
	if (!feature['auditSource'] || feature['verificationEvidence']) {
		return;
	}

	const isCompleted = COMPLETED_STATUSES.has(String(feature['status']));
	const description = feature['description'];
	const evidenceMatch =
		typeof description === 'string'
			? description.match(/(?:Verified|Confirmed):\s*([\s\S]+)$/)
			: null;

	if (!evidenceMatch?.[1]) {
		if (isCompleted) {
			manualFollowUps.push(
				`${context.id}: missing verificationEvidence on completed audit feature; reported only`,
			);
		}
		return;
	}

	if (isCompleted) {
		manualFollowUps.push(
			`${context.id}: concrete verification evidence exists in description but was not backfilled because the feature is historical/completed`,
		);
		return;
	}

	feature['verificationEvidence'] = evidenceMatch[1].trim();
	actions.push('backfilled verificationEvidence from description evidence');
}

function orderFeatureKeys(feature: FeatureJson): FeatureJson {
	const ordered: FeatureJson = {};
	for (const key of CANONICAL_KEY_ORDER) {
		if (hasOwn(feature, key)) {
			ordered[key] = feature[key];
		}
	}
	for (const [key, value] of Object.entries(feature)) {
		if (!hasOwn(ordered, key)) {
			ordered[key] = value;
		}
	}
	return ordered;
}

export function analyzeFeature(json: FeatureJson): SchemaAnalysis {
	return {
		legacyAcceptanceCriteria: hasOwn(json, 'acceptance_criteria'),
		legacyFileLocations: hasOwn(json, 'file_locations'),
		missingDependencies: !hasOwn(json, 'dependencies') || json['dependencies'] === null,
		mixedSchema:
			(hasOwn(json, 'acceptance_criteria') && hasOwn(json, 'spec')) ||
			(hasOwn(json, 'file_locations') && hasOwn(json, 'affectedFiles')),
	};
}

function normalizeDependencies(
	next: FeatureJson,
	context: NormalizeContext,
	actions: string[],
	manualFollowUps: string[],
): void {
	const originalDependencies = canonicalizeDependencies(next['dependencies']).map(
		normalizeDependency,
	);
	if (!hasOwn(next, 'dependencies') || next['dependencies'] === null) {
		actions.push('added empty dependencies array');
	}

	const normalizedDependencies: string[] = [];
	const unresolvedDependencies: string[] = [];

	for (const dependency of originalDependencies) {
		if (!dependency) {
			continue;
		}
		if (context.idMap.has(dependency)) {
			normalizedDependencies.push(dependency);
			continue;
		}
		const mappedDir = context.dirMap.get(dependency);
		if (mappedDir) {
			normalizedDependencies.push(mappedDir);
			actions.push(`normalized dependency directory "${dependency}" to feature id`);
			continue;
		}
		const titleMatches = context.titleMap.get(dependency) ?? [];
		if (titleMatches.length === 1 && titleMatches[0]) {
			normalizedDependencies.push(titleMatches[0]);
			actions.push(`normalized dependency title "${dependency}" to feature id`);
			continue;
		}
		unresolvedDependencies.push(dependency);
	}

	if (unresolvedDependencies.length > 0) {
		manualFollowUps.push(
			`${next['id'] || context.dir}: unresolved dependencies -> ${unresolvedDependencies.join(', ')}`,
		);
	}

	next['dependencies'] = uniqueValues(normalizedDependencies);
}

function normalizeLegacyKeys(next: FeatureJson, actions: string[]): void {
	if (hasOwn(next, 'acceptance_criteria')) {
		if (!hasOwn(next, 'spec')) {
			next['spec'] = next['acceptance_criteria'];
			actions.push('migrated acceptance_criteria to spec');
		}
		delete next['acceptance_criteria'];
		actions.push('removed acceptance_criteria');
	}

	if (hasOwn(next, 'file_locations')) {
		if (!hasOwn(next, 'affectedFiles')) {
			next['affectedFiles'] = next['file_locations'];
			actions.push('migrated file_locations to affectedFiles');
		}
		delete next['file_locations'];
		actions.push('removed file_locations');
	}
}

function normalizeScalars(next: FeatureJson, actions: string[]): void {
	const priority = next['priority'];
	if (typeof priority === 'string' && /^\d+$/.test(priority.trim())) {
		next['priority'] = Number.parseInt(priority.trim(), 10);
		actions.push('normalized priority to number');
	}

	const passes = next['passes'];
	if (typeof passes === 'string') {
		if (passes.trim() === 'true') {
			next['passes'] = true;
			actions.push('normalized passes to boolean true');
		} else if (passes.trim() === 'false') {
			next['passes'] = false;
			actions.push('normalized passes to boolean false');
		}
	}
}

function normalizeAffectedFilesAndSpec(next: FeatureJson, actions: string[]): void {
	if (hasOwn(next, 'affectedFiles')) {
		if (typeof next['affectedFiles'] === 'string') {
			next['affectedFiles'] = [next['affectedFiles']];
			actions.push('normalized affectedFiles to array');
		}
		const affectedFiles = next['affectedFiles'];
		if (Array.isArray(affectedFiles)) {
			next['affectedFiles'] = uniqueValues(
				affectedFiles
					.filter((entry): entry is string => typeof entry === 'string')
					.map((entry) => entry.trim())
					.filter(Boolean),
			);
		}
	}

	const spec = next['spec'];
	if (hasOwn(next, 'spec') && typeof spec === 'string') {
		const trimmedSpec = spec.trim();
		if (trimmedSpec !== spec) {
			next['spec'] = trimmedSpec;
			actions.push('trimmed spec whitespace');
		}
	}
}

export function normalizeFeature(json: FeatureJson, context: NormalizeContext): NormalizeResult {
	const actions: string[] = [];
	const manualFollowUps: string[] = [];
	const next = structuredClone(json);

	trimStringFields(next);
	normalizeLegacyKeys(next, actions);
	normalizeScalars(next, actions);
	normalizeDependencies(next, context, actions, manualFollowUps);
	normalizeAffectedFilesAndSpec(next, actions);

	const status = next['status'];
	if (typeof status === 'string' && !VALID_STATUSES.has(status)) {
		manualFollowUps.push(`${next['id'] || context.dir}: invalid status "${status}"`);
	}

	for (const field of REQUIRED_FIELDS) {
		if (!hasOwn(next, field)) {
			manualFollowUps.push(`${next['id'] || context.dir}: missing required field "${field}"`);
		}
	}

	maybeBackfillVerificationEvidence(next, context, manualFollowUps, actions);

	return {
		actions,
		json: orderFeatureKeys(next),
		manualFollowUps,
	};
}

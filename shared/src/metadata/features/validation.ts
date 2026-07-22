import { isAuditFinding, isRemediationFeature } from './query.ts';
import {
	FEATURE_ID_PATTERN,
	type Feature,
	type FeatureCollectionValidationResult,
	type FeatureValidationIssue,
} from './types.ts';

// The full canonical status vocabulary. 'completed' is the only completion status —
// strays like 'done' or 'verified' are invalid data, never aliases.
export const FEATURE_STATUSES = [
	'backlog',
	'in_progress',
	'completed',
	'waiting_approval',
] as const;

export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export function isValidFeatureStatus(status: string): status is FeatureStatus {
	return (FEATURE_STATUSES as readonly string[]).includes(status);
}

function requiresCompletionResolutionNote(feature: Feature): boolean {
	return feature.status === 'completed' && feature.passes === true
		? isAuditFinding(feature) || isRemediationFeature(feature)
		: false;
}

function hasResolutionNote(notes: unknown): boolean {
	if (typeof notes === 'string') return notes.trim().length > 0;
	if (Array.isArray(notes)) {
		return notes.some((note) => typeof note === 'string' && note.trim().length > 0);
	}
	return false;
}

export function validateFeatureContract(feature: Feature): FeatureValidationIssue[] {
	const issues: FeatureValidationIssue[] = [];
	const id = feature.directory ?? feature.id ?? 'unknown';
	if (!feature.id) {
		issues.push({ id, message: 'Missing required field: id' });
	} else if (!FEATURE_ID_PATTERN.test(feature.id)) {
		issues.push({
			id,
			message: `Invalid 'id' format: '${feature.id}' (expected: descriptive-slug, spernakit-{timestamp}-{slug}, audit-{type}-{timestamp}-{description}, or remediation-({timestamp}-)?{slug})`,
		});
	}
	if (
		feature.auditSource &&
		typeof feature.auditSource === 'string' &&
		feature.auditSource !== '' &&
		typeof feature.id === 'string'
	) {
		if (!feature.id.startsWith('audit-')) {
			issues.push({
				id,
				message: `Audit finding id must start with 'audit-' (got: '${feature.id}')`,
			});
		} else if (feature.directory && feature.id !== feature.directory) {
			issues.push({
				id,
				message: `Audit finding id must match directory name (id='${feature.id}', dir='${feature.directory}')`,
			});
		}
	}
	if (feature.passes !== undefined && typeof feature.passes !== 'boolean') {
		issues.push({ id, message: 'passes must be boolean' });
	}
	if (feature.status !== undefined && !isValidFeatureStatus(feature.status)) {
		issues.push({ id, message: `Invalid status: ${feature.status}` });
	}
	if (feature.dependencies !== undefined && !Array.isArray(feature.dependencies)) {
		issues.push({ id, message: 'dependencies must be an array' });
	}
	if (feature.passes === true && feature.status === 'backlog') {
		issues.push({ id, message: 'Feature has passes=true but status is still backlog' });
	}
	if (requiresCompletionResolutionNote(feature) && !hasResolutionNote(feature.notes)) {
		issues.push({
			id,
			message:
				'Completed audit/remediation features with passes=true must include a non-empty notes resolution',
		});
	}
	return issues;
}

// Collection-level checks that cannot be expressed by validateFeatureContract because they
// require visibility across every loaded feature: duplicate id values, mismatches between a
// feature's persisted id and its containing directory, and (as a warning) duplicate normalized
// titles among open backlog/remediation/audit work that likely represent the same item.
export function validateFeatureCollection(features: Feature[]): FeatureCollectionValidationResult {
	const issues: FeatureValidationIssue[] = [];
	const warnings: FeatureValidationIssue[] = [];

	const byId = new Map<string, Feature[]>();
	for (const feature of features) {
		if (typeof feature.id !== 'string' || feature.id === '') continue;
		const group = byId.get(feature.id) ?? [];
		group.push(feature);
		byId.set(feature.id, group);
	}
	for (const [duplicateId, group] of byId) {
		if (group.length <= 1) continue;
		const directories = group.map((feature) => feature.directory ?? feature.id).sort();
		for (const directory of directories) {
			issues.push({
				id: directory,
				message: `Duplicate feature id '${duplicateId}' shared by directories: ${directories.join(', ')}`,
			});
		}
	}

	for (const feature of features) {
		if (typeof feature.id !== 'string' || feature.id === '') continue;
		if (typeof feature.directory !== 'string' || feature.directory === '') continue;
		if (feature.id === feature.directory) continue;
		if (feature.id.startsWith('audit-')) continue;
		issues.push({
			id: feature.directory,
			message: `Feature id '${feature.id}' does not match directory name '${feature.directory}'`,
		});
	}

	const openStatuses = new Set(['backlog', 'in_progress', 'waiting_approval']);
	const byNormalizedTitle = new Map<string, Feature[]>();
	for (const feature of features) {
		const title = typeof feature.title === 'string' ? feature.title : '';
		const normalized = normalizeFeatureTitle(title);
		if (!normalized) continue;
		const status = feature.status ?? 'backlog';
		if (!openStatuses.has(status)) continue;
		const group = byNormalizedTitle.get(normalized) ?? [];
		group.push(feature);
		byNormalizedTitle.set(normalized, group);
	}
	for (const group of byNormalizedTitle.values()) {
		if (group.length <= 1) continue;
		const directories = group.map((feature) => feature.directory ?? feature.id).sort();
		for (const feature of group) {
			warnings.push({
				id: feature.directory ?? feature.id,
				message: `Open feature title likely duplicates other open features: ${directories.join(', ')}`,
			});
		}
	}

	// Soft convention (warning, never a hard failure): a shipped feature's changed files are
	// knowable from the diff at completion time, so completed work should carry affectedFiles.
	// document-changes stamps it; this flags the records that slipped through. Backlog/in-progress
	// features are exempt because their files are an output of the work, not a precondition.
	for (const feature of features) {
		if (feature.status !== 'completed' || feature.passes !== true) continue;
		if (hasAffectedFiles(feature.affectedFiles)) continue;
		warnings.push({
			id: feature.directory ?? feature.id ?? 'unknown',
			message:
				'Completed feature with passes=true is missing affectedFiles (expected from the diff)',
		});
	}

	return { issues, warnings };
}

function hasAffectedFiles(affectedFiles: unknown): boolean {
	return (
		Array.isArray(affectedFiles) &&
		affectedFiles.some((file) => typeof file === 'string' && file.trim().length > 0)
	);
}

function normalizeFeatureTitle(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

import type { AuditAssuranceBucket } from '../../api/types.ts';

export type HealthFilter = 'all' | 'fresh' | 'missing' | 'not-applicable' | 'stale';
export type AuditsTab = 'applicability' | 'catalog' | 'overrides';

// Catalog anchors. They live here rather than beside their components because a file that
// exports a component may not export anything else (react-refresh/only-export-components).
export const auditLaunchTargetsId = 'audit-launch-targets';
export const auditDefinitionEditorId = 'audit-definition-editor';
export const auditCatalogListId = 'audit-catalog-list';
export const auditCatalogHeadingId = 'audit-catalog-heading';

export function auditCatalogCardId(name: string): string {
	return `audit-catalog-card-${encodeURIComponent(name)}`;
}

export const bucketColumns: AuditAssuranceBucket[] = [
	'prototype_archive',
	'single_user_local',
	'multi_user_local',
	'private_team',
	'internet_single_org',
	'public_multi_tenant',
	'critical_regulated',
];

// Column headers carry the units so the rows do not have to. A catalog row that restates
// "applicable", "buckets" and "fresh / stale / missing" adds up to 168 repeated words in a table
// whose data is five numbers per row, and the repetition is what stops the numbers forming columns.
export const reportsColumnLabel = 'Reports (fresh / stale / missing)';
export const bucketsColumnLabel = `Buckets (of ${bucketColumns.length})`;

// Every audit definition lives in the same directory, so repeating the prefix on all ~40 rows
// spends the catalog's narrowest column on the one part of the path that never varies. The row shows
// the file name; the full path stays in the cell's `title` and in the definition editor's header.
export function auditFileName(path: string): string {
	const segments = path.split(/[/\\]/);
	return segments[segments.length - 1] || path;
}

export function healthFor(definition: {
	applicableProjectCount: number;
	missingReportCount: number;
	staleReportCount: number;
}): HealthFilter {
	if (definition.applicableProjectCount === 0) return 'not-applicable';
	if (definition.missingReportCount > 0) return 'missing';
	if (definition.staleReportCount > 0) return 'stale';
	return 'fresh';
}

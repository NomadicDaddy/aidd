import type { AuditOverrideEffect, ProjectAuditEntry, ProjectFeature } from '../../../api/types.ts';

export type EnabledFilter = 'all' | 'disabled' | 'enabled';
export type OverrideValue = 'default' | AuditOverrideEffect;
export type AuditSortKey = 'audit' | 'potential' | 'report' | 'state';
export interface AuditSort {
	direction: 'asc' | 'desc';
	key: AuditSortKey;
}

function reportRank(entry: ProjectAuditEntry): number {
	if (entry.missingReport) return 0;
	if (entry.staleReport) return 1;
	return 2;
}

export function sortAudits(entries: ProjectAuditEntry[], sort: AuditSort): ProjectAuditEntry[] {
	return [...entries].sort((left, right) => {
		let result: number;
		if (sort.key === 'audit') result = left.name.localeCompare(right.name);
		else if (sort.key === 'potential') {
			result = (left.changePotential?.score ?? -1) - (right.changePotential?.score ?? -1);
		} else if (sort.key === 'report') result = reportRank(left) - reportRank(right);
		else result = Number(left.enabled) - Number(right.enabled);
		if (result === 0) result = left.name.localeCompare(right.name);
		return sort.direction === 'asc' ? result : -result;
	});
}

function auditSource(feature: ProjectFeature): string | undefined {
	if (feature.auditSource?.trim()) return feature.auditSource.trim().toUpperCase();
	const directoryName = feature.directory ?? feature.id;
	const match = directoryName.match(/^audit-([a-z][a-z0-9_-]*?)-\d+-/u);
	return match?.[1]?.replace(/-/g, '_').toUpperCase();
}

export function activeAuditFindings(
	features: ProjectFeature[],
	auditName: string,
): ProjectFeature[] {
	const normalized = auditName.toUpperCase();
	return features.filter(
		(feature) =>
			feature.passes !== true &&
			feature.status !== 'completed' &&
			auditSource(feature) === normalized,
	);
}

export function describeReportFreshness(entry: ProjectAuditEntry): string | undefined {
	const freshness = entry.reportFreshness;
	if (!freshness || freshness.reasons.length === 0) return undefined;
	const changeSummary = freshness.changes
		? `${freshness.changes.codeCommits.toLocaleString()} commits, ${freshness.changes.sourceFiles.toLocaleString()} source files, ${freshness.changes.sourceLines.toLocaleString()} changed lines since the last report`
		: 'code-change inspection unavailable';
	return `Stale: ${changeSummary}.`;
}

export function describeFreshAge(entry: ProjectAuditEntry): string | undefined {
	const ageDays = entry.reportFreshness?.ageDays;
	if (ageDays === null || ageDays === undefined) return undefined;
	if (ageDays === 0) return '0 days old';
	if (ageDays === 1) return '1 day old';
	return `${ageDays} days old`;
}

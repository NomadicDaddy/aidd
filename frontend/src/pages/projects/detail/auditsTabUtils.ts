import type { AuditOverrideEffect, ProjectAuditEntry, ProjectFeature } from '../../../api/types.ts';

export type EnabledFilter = 'all' | 'disabled' | 'enabled';
export type OverrideValue = 'default' | AuditOverrideEffect;

/** The last two path segments — 'audits/CODE_QUALITY.md'. Every audit lives under the same
 *  directory, so the absolute prefix identifies nothing in the row; `AuditPath` exposes it. */
export function auditPathTail(path: string): string {
	return path.split(/[/\\]/u).filter(Boolean).slice(-2).join('/');
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
	const reasonLabels = freshness.reasons.map((reason) => reason.replace(/_/g, ' ')).join(', ');
	const changeSummary = freshness.changes
		? `${freshness.changes.codeCommits} commits, ${freshness.changes.sourceFiles} source files, ${freshness.changes.sourceLines} changed lines`
		: 'code-change inspection unavailable';
	return `Stale because of ${reasonLabels}. ${changeSummary}.`;
}

export function describeFreshAge(entry: ProjectAuditEntry): string | undefined {
	const ageDays = entry.reportFreshness?.ageDays;
	if (ageDays === null || ageDays === undefined) return undefined;
	if (ageDays === 0) return '0 days old';
	if (ageDays === 1) return '1 day old';
	return `${ageDays} days old`;
}

import type { AuditOverrideEffect, ProjectAuditEntry } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';

export type EnabledFilter = 'all' | 'disabled' | 'enabled';
export type OverrideValue = 'default' | AuditOverrideEffect;

export function stateBadge(entry: ProjectAuditEntry) {
	if (entry.overrideEffect === 'required') {
		return <Badge tone="teal">Enabled (override)</Badge>;
	}
	if (entry.overrideEffect === 'disabled' || entry.overrideEffect === 'excluded') {
		return <Badge tone="red">Disabled (override)</Badge>;
	}
	if (entry.enabled) return <Badge tone="emerald">Enabled</Badge>;
	if (!entry.appliesToBucket) return <Badge tone="neutral">Disabled (profile)</Badge>;
	return <Badge tone="neutral">Disabled</Badge>;
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

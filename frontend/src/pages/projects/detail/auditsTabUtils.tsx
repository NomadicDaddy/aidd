import type { AuditOverrideEffect, ProjectAuditEntry } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';

export type EnabledFilter = 'all' | 'disabled' | 'enabled';
export type OverrideValue = 'default' | AuditOverrideEffect;

/** The last two path segments — 'audits/CODE_QUALITY.md' — with the absolute path left for a
 *  `title`. Every audit lives under the same directory, so the prefix identified nothing. */
export function auditPathTail(path: string): string {
	return path.split(/[/\\]/u).filter(Boolean).slice(-2).join('/');
}

// One word per state, with the qualifier in the tooltip. 'Disabled (override)' was the only label
// long enough to wrap inside its badge, which made that one row ~14px taller than its neighbours.
//
// Enabled is the default and holds for nearly every row, so it renders as plain text rather than as
// a badge: twenty-odd identical emerald pills carried no information and drowned out the handful of
// rows that are genuinely exceptional. None of the remaining states is a fault either — an override
// is a deliberate configuration choice and a profile-disabled audit is the profile working — so the
// badges are neutral and the words carry the distinction.
export function stateBadge(entry: ProjectAuditEntry) {
	if (entry.overrideEffect === 'required') {
		return (
			<Badge title="Enabled by a project override" tone="neutral">
				Overridden on
			</Badge>
		);
	}
	if (entry.overrideEffect === 'disabled' || entry.overrideEffect === 'excluded') {
		return (
			<Badge title="Disabled by a project override" tone="neutral">
				Overridden off
			</Badge>
		);
	}
	if (entry.enabled) return <span className="text-xs text-muted-foreground">Enabled</span>;
	if (!entry.appliesToBucket) {
		return (
			<Badge title="Disabled by the project's assurance profile" tone="neutral">
				Profile-disabled
			</Badge>
		);
	}
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

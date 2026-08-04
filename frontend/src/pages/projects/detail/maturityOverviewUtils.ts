import { default as CircleCheck } from 'lucide-react/dist/esm/icons/circle-check';
import { default as CircleDashed } from 'lucide-react/dist/esm/icons/circle-dashed';
import { default as CircleDot } from 'lucide-react/dist/esm/icons/circle-dot';

import type {
	MaturityArtifact,
	MaturityAuditEntry,
	MaturityNextAction,
	MaturityStageStatus,
} from '../../../api/types.ts';

export type Tone = 'amber' | 'emerald' | 'neutral' | 'red' | 'teal';

export const STAGE_ICON_BY_STATUS: Record<MaturityStageStatus, typeof CircleCheck> = {
	complete: CircleCheck,
	empty: CircleDashed,
	partial: CircleDot,
};

export const STAGE_ICON_TONE: Record<MaturityStageStatus, string> = {
	complete: 'text-emerald-600 dark:text-emerald-400',
	empty: 'text-muted-foreground ',
	partial: 'text-amber-600 dark:text-amber-400',
};

export function artifactTone(artifact: MaturityArtifact): Tone {
	if (artifact.status === 'fresh') return 'emerald';
	if (artifact.status === 'stale') return 'amber';
	if (artifact.status === 'skipped') return 'neutral';
	if (artifact.status === 'fail') return 'red';
	return artifact.required ? 'red' : 'neutral';
}

export function artifactStatusLabel(artifact: MaturityArtifact): string {
	if (artifact.status === 'missing' && !artifact.required) return 'optional';
	return artifact.status;
}

export function auditFreshnessTone(freshness: MaturityAuditEntry['freshness']): Tone {
	if (freshness === 'fresh') return 'emerald';
	if (freshness === 'stale') return 'amber';
	return 'red';
}

export function auditFreshnessTitle(entry: MaturityAuditEntry): string | undefined {
	if (entry.staleReasons.length === 0) return undefined;
	const reasonLabels = entry.staleReasons.map((reason) => reason.replace(/_/g, ' ')).join(', ');
	const changeSummary = entry.changes
		? `${entry.changes.codeCommits} commits, ${entry.changes.sourceFiles} source files, ${entry.changes.sourceLines} changed lines`
		: 'code-change inspection unavailable';
	return `Stale because of ${reasonLabels}. ${changeSummary}.`;
}

export function describeAuditAgeDays(ageDays: null | number): null | string {
	if (ageDays === null || ageDays === undefined) return null;
	if (ageDays === 0) return '0 days old';
	if (ageDays === 1) return '1 day old';
	return `${ageDays} days old`;
}

export function auditRunTone(status: MaturityAuditEntry['lastRunStatus']): Tone {
	if (status === 'success') return 'emerald';
	if (status === 'failure') return 'red';
	return 'neutral';
}

export function nextActionLabel(action: MaturityNextAction): string {
	if (action.invocation === 'manual') return 'Open instructions';
	if (action.invocation === 'audit') return `Run audit: ${action.auditName ?? action.slug}`;
	if (action.invocation === 'skill') {
		return `Run skill: ${action.skillId ?? action.slug}`;
	}
	if (action.invocation === 'profile') return 'Create profile';
	if (action.invocation === 'feature') return 'Create feature';
	return `Run: ${action.command ?? action.slug}`;
}

import type { DirectorRiskLevel, DirectorTaskType } from 'aidd-shared';
import type { AuditChangeCounts, AuditStaleReason } from 'aidd-shared/metadata/audit-freshness';

export const directorPriorityOrder = [
	'artifact_maintenance',
	'audit_backlog',
	'remediation_backlog',
	'audit_maintenance',
	'feature_completion',
	// Intake is an additive nudge for un-analyzed onboarding projects; it does not preempt
	// the established maintenance/backlog priorities above.
	'project_intake',
] as const satisfies readonly DirectorTaskType[];

export type DirectorPriorityTaskType = (typeof directorPriorityOrder)[number];

export type DirectorPriorityBucket =
	| 'artifact'
	| 'audit_backlog'
	| 'audit_stale'
	| 'feature_backlog'
	| 'healthy'
	| 'remediation_backlog';

export type DirectorHealthBand =
	| 'artifact_unhealthy'
	| 'audit_backlog'
	| 'audit_stale'
	| 'feature_backlog'
	| 'healthy'
	| 'remediation_backlog';

export interface DirectorPriorityHealth {
	band: DirectorHealthBand;
	primaryBucket: DirectorPriorityBucket;
	primaryTaskType: DirectorPriorityTaskType | null;
	reasons: string[];
	score: number;
}

export interface DirectorBacklogItemSummary {
	auditSeverity?: string;
	id: string;
	priority: null | number;
	title: string;
}

export interface DirectorBacklogBreakdown {
	audit: {
		bySeverity: Record<string, number>;
		count: number;
		top: DirectorBacklogItemSummary[];
	};
	feature: {
		blockedCount: number;
		count: number;
		readyCount: number;
		top: DirectorBacklogItemSummary[];
	};
	remediation: {
		count: number;
		top: DirectorBacklogItemSummary[];
	};
}

export interface DirectorAuditHealth {
	checkedAt: string;
	fresh: string[];
	missing: string[];
	stale: {
		ageDays: null | number;
		changes: AuditChangeCounts | null;
		name: string;
		reasons: AuditStaleReason[];
		report: string;
	}[];
	staleThresholdDays: number;
}

export interface DirectorPrioritizedWork {
	evidence: Record<string, unknown>;
	projectId: string;
	rank: number;
	reason: string;
	riskLevel: DirectorRiskLevel;
	suggestedArgs: null | Record<string, string>;
	suggestedRecipe: null | string;
	taskType: DirectorPriorityTaskType;
	title: string;
}

export interface DirectorProjectPrioritySummary {
	auditHealth: DirectorAuditHealth;
	backlog: DirectorBacklogBreakdown;
	priorityHealth: DirectorPriorityHealth;
	work: DirectorPrioritizedWork[];
}

export const bucketRank: Record<DirectorPriorityTaskType, number> = {
	artifact_maintenance: 0,
	audit_backlog: 1,
	audit_maintenance: 3,
	feature_completion: 4,
	project_intake: 5,
	remediation_backlog: 2,
};

export const healthBands: Record<
	DirectorPriorityTaskType,
	{
		band: DirectorHealthBand;
		bucket: DirectorPriorityBucket;
		scoreCeiling: number;
	}
> = {
	artifact_maintenance: {
		band: 'artifact_unhealthy',
		bucket: 'artifact',
		scoreCeiling: 40,
	},
	audit_backlog: {
		band: 'audit_backlog',
		bucket: 'audit_backlog',
		scoreCeiling: 55,
	},
	audit_maintenance: {
		band: 'audit_stale',
		bucket: 'audit_stale',
		scoreCeiling: 75,
	},
	feature_completion: {
		band: 'feature_backlog',
		bucket: 'feature_backlog',
		scoreCeiling: 85,
	},
	// Intake shares the artifact health band (metadata not yet established) but is an
	// additive low-urgency nudge, so it carries a high score ceiling.
	project_intake: {
		band: 'artifact_unhealthy',
		bucket: 'artifact',
		scoreCeiling: 88,
	},
	remediation_backlog: {
		band: 'remediation_backlog',
		bucket: 'remediation_backlog',
		scoreCeiling: 65,
	},
};

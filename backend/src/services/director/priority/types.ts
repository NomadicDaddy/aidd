import type { DirectorRiskLevel, DirectorTaskType } from 'aidd-shared';
import type { AuditChangeCounts, AuditStaleReason } from 'aidd-shared/metadata/audit-freshness';

export const directorPriorityOrder = [
	'artifact_maintenance',
	'audit_backlog',
	'remediation_backlog',
	// Folding completed findings is cheap housekeeping that keeps the backlog honest; it follows
	// the open backlogs and comes before audit refreshes, which would otherwise re-raise them.
	'finding_consolidation',
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
	| 'finding_consolidation'
	| 'healthy'
	| 'remediation_backlog';

export type DirectorHealthBand =
	| 'artifact_unhealthy'
	| 'audit_backlog'
	| 'audit_stale'
	| 'feature_backlog'
	| 'finding_consolidation'
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
		blockedCount: number;
		bySeverity: Record<string, number>;
		count: number;
		readyCount: number;
		top: DirectorBacklogItemSummary[];
	};
	feature: {
		blockedCount: number;
		count: number;
		readyCount: number;
		top: DirectorBacklogItemSummary[];
	};
	remediation: {
		blockedCount: number;
		count: number;
		readyCount: number;
		top: DirectorBacklogItemSummary[];
	};
	/** Completed audit and remediation findings still standing as records, waiting to be folded
	 * into the features they changed. Template-owned records in a derived app are not counted. */
	unfolded: {
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
	/**
	 * The project's unique route identity — its basename while that basename is unique across the
	 * fleet, and `basename~hash` once it is not. Deliberately not the bare basename: two checkouts
	 * called `sample` are two different working trees, and a suggestion that names only `sample`
	 * cannot say which one it means, so the launcher would be free to pick either.
	 */
	projectId: string;
	/**
	 * The project's basename, for reading. Optional because it carries no identity: a work item
	 * assembled without one falls back to `projectId`, which is the basename anyway wherever the
	 * two can differ only by a disambiguator.
	 */
	projectName?: string;
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
	audit_maintenance: 4,
	feature_completion: 5,
	finding_consolidation: 3,
	project_intake: 6,
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
	finding_consolidation: {
		band: 'finding_consolidation',
		bucket: 'finding_consolidation',
		scoreCeiling: 70,
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

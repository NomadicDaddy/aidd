export type DirectorPriorityTaskType =
	| 'artifact_maintenance'
	| 'audit_backlog'
	| 'audit_maintenance'
	| 'feature_completion'
	| 'project_intake'
	| 'remediation_backlog';

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

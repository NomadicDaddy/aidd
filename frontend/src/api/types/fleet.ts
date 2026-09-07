import type { AuditReportCodeChanges, AuditReportStaleReason } from './audits.ts';
import type {
	DirectorPriorityHealth,
	DirectorPriorityTaskType,
	DirectorRiskLevel,
} from './director.ts';
import type { ProjectArtifactCheckSummary, ProjectAssuranceProfile } from './projects-profile.ts';
import type { ProjectSummary } from './projects.ts';

export interface FleetSummaryProject {
	artifactCheck: null | ProjectArtifactCheckSummary;
	artifactHealth: ProjectSummary['artifactHealth'];
	auditFindings: {
		bySeverity: Record<string, number>;
		total: number;
	};
	auditHealth: {
		checkedAt: string;
		fresh: string[];
		missing: string[];
		stale: {
			ageDays: null | number;
			changes: AuditReportCodeChanges | null;
			name: string;
			reasons: AuditReportStaleReason[];
			report: string;
		}[];
		staleThresholdDays: number;
	};
	backlog: {
		audit: {
			bySeverity: Record<string, number>;
			count: number;
			top: {
				auditSeverity?: string;
				id: string;
				priority: null | number;
				title: string;
			}[];
		};
		feature: {
			blockedCount: number;
			count: number;
			readyCount: number;
			top: { id: string; priority: null | number; title: string }[];
		};
		remediation: {
			count: number;
			top: { id: string; priority: null | number; title: string }[];
		};
	};
	completedCount: number;
	dependencyBlockedCount: number;
	featureCompletion: number;
	featureCount: number;
	lastRunResult: {
		completedAt: null | string;
		status: null | string;
	};
	phase: string;
	priorityHealth: DirectorPriorityHealth;
	profile: ProjectAssuranceProfile;
	projectId: number;
	/** The project's basename, for reading. Not unique across the fleet; never match on it. */
	projectName: string;
	/** The project's unique route identity, the only string that names one working tree. */
	slug: string;
}

export interface FleetSummary {
	aggregateErrors: Record<string, string>;
	fleetAggregations: {
		approvalCounts: { approved: number; launched: number; pending: number };
		featurePassRate: number;
		fleetHealthScore: number;
		priorityHealth: DirectorPriorityHealth;
		projectCount: number;
	};
	generatedAt: string;
	prioritizedWork: {
		evidence: Record<string, unknown>;
		projectId: string;
		projectName?: string;
		rank: number;
		reason: string;
		riskLevel: DirectorRiskLevel;
		suggestedArgs: null | Record<string, string>;
		suggestedRecipe: null | string;
		taskType: DirectorPriorityTaskType;
		title: string;
	}[];
	priorityOrder: readonly [
		'artifact_maintenance',
		'audit_backlog',
		'remediation_backlog',
		'audit_maintenance',
		'feature_completion',
		'project_intake',
	];
	projects: FleetSummaryProject[];
	signals: unknown[];
	ttlSeconds: number;
}

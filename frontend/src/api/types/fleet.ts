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
			count: number;
			top: { id: string; priority: null | number; title: string }[];
		};
		remediation: {
			count: number;
			top: { id: string; priority: null | number; title: string }[];
		};
	};
	completedCount: number;
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
		rank: number;
		reason: string;
		riskLevel: DirectorRiskLevel;
		suggestedArgs: null | Record<string, string>;
		suggestedRecipe: null | string;
		taskType: DirectorPriorityTaskType;
		title: string;
	}[];
	priorityOrder: DirectorPriorityTaskType[];
	projects: FleetSummaryProject[];
	signals: unknown[];
	ttlSeconds: number;
}

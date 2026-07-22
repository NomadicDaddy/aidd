import type { ProjectAssuranceBucket } from 'aidd-shared';
import type { AuditChangeCounts, AuditStaleReason } from 'aidd-shared/metadata/audit-freshness';
import type { ChangePotential } from 'aidd-shared/metadata/audit-scoring';
import type { BackendName } from 'aidd-shared/plan/types';

export interface AuditDefinitionDto {
	applicableBucketCount: number;
	applicableProjectCount: number;
	appliesToBucket: Record<ProjectAssuranceBucket, boolean>;
	changePotential?: ChangePotential;
	content?: string;
	enabled: boolean;
	excludedProjectCount: number;
	freshReportCount: number;
	missingReportCount: number;
	name: string;
	path: string;
	staleReportCount: number;
	updatedAt: null | string;
}

export interface AuditManagerDto {
	auditsEnabled: boolean;
	definitions: AuditDefinitionDto[];
	projects: { id: string; name: string; path: string }[];
}

export interface ProjectAuditEntryDto {
	appliesToBucket: boolean;
	changePotential?: ChangePotential;
	enabled: boolean;
	freshReport: boolean;
	missingReport: boolean;
	name: string;
	overrideEffect: 'disabled' | 'excluded' | 'required' | null;
	path: string;
	reportFreshness?: {
		ageDays: null | number;
		changes: AuditChangeCounts | null;
		reasons: AuditStaleReason[];
		report: null | string;
	};
	staleReport: boolean;
	updatedAt: null | string;
}

export interface ProjectAuditsDto {
	auditsEnabled: boolean;
	bucket: ProjectAssuranceBucket;
	entries: ProjectAuditEntryDto[];
	projectId: string;
	projectName: string;
	projectPath: string;
}

export interface AuditLaunchInput {
	auditAll?: boolean;
	auditNames?: string[];
	// Optional launch-target override applied to every launched run; unset fields
	// resolve from project/global config.
	backend?: BackendName;
	model?: string;
	projectIds: string[];
	reasoningEffort?: string;
	review?: boolean;
}

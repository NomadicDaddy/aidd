import type {
	AuditApplicabilityRow,
	AuditProfileMapping,
	ProjectAssuranceBucket,
} from 'aidd-shared';
import type { RunInitiator } from 'aidd-shared/metadata/active-runs';
import type { AuditChangeCounts, AuditStaleReason } from 'aidd-shared/metadata/audit-freshness';
import type { ChangePotential } from 'aidd-shared/metadata/audit-scoring';
import type { BackendName } from 'aidd-shared/plan/types';

import type { AuditOutcomeMeasures } from '../outcome/types.ts';

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
	outcome?: AuditOutcomeMeasures;
	path: string;
	staleReportCount: number;
	updatedAt: null | string;
}

export interface AuditManagerDto {
	auditsEnabled: boolean;
	definitions: AuditDefinitionDto[];
	projects: { id: string; name: string; path: string }[];
}

export interface AuditProfileMappingDto {
	auditNames: string[];
	mapping: AuditProfileMapping;
	matrix: AuditApplicabilityRow[];
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
	/**
	 * Who is starting these runs. Required, and never derived from `source`: a Run now on a
	 * scheduled audit task arrives here with source 'scheduled' and an operator standing in front
	 * of it, and inferring the initiator from the surface filed that person's work as aidd's.
	 */
	initiator: RunInitiator;
	model?: string;
	projectIds: string[];
	reasoningEffort?: string;
	review?: boolean;
	scheduledTaskExecutionId?: string;
	source?: 'scheduled';
}

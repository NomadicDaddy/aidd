import type { CLIBackend } from 'aidd-shared/backends/types';
import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';
import type { BackendName } from 'aidd-shared/plan/types';

import type { directorProfiles } from '../../db/schema.ts';
import type { ProjectSummaryDto } from '../../types.ts';
import type {
	DirectorAuditHealth,
	DirectorBacklogBreakdown,
	DirectorPrioritizedWork,
	DirectorPriorityHealth,
	directorPriorityOrder,
} from '../directorPriority.ts';

export type DirectorConfig = { web: ResolvedWebConfig } & ResolvedConfig;
export type DirectorConfigProvider = () => DirectorConfig;
export type BackendFactory = (name: BackendName) => CLIBackend;
export type ProfileRow = typeof directorProfiles.$inferSelect;
export type DirectorOutputStatus = 'invalid' | 'missing' | 'ok';

export interface DirectorRecipeSummary {
	description?: string;
	id: string;
	name: string;
}

export interface FleetSummaryProject {
	artifactCheck: ProjectSummaryDto['metadata']['artifactCheck'];
	artifactHealth: ProjectSummaryDto['artifactHealth'];
	auditFindings: {
		bySeverity: Record<string, number>;
		total: number;
	};
	auditHealth: DirectorAuditHealth;
	backlog: DirectorBacklogBreakdown;
	completedCount: number;
	featureCompletion: number;
	featureCount: number;
	lastRunResult: {
		completedAt: null | string;
		status: null | string;
	};
	phase: string;
	priorityHealth: DirectorPriorityHealth;
	profile: ProjectSummaryDto['metadata']['profile'];
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
	prioritizedWork: DirectorPrioritizedWork[];
	priorityOrder: typeof directorPriorityOrder;
	projects: FleetSummaryProject[];
	signals: unknown[];
	ttlSeconds: number;
}

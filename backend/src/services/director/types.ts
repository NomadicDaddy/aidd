import type { DirectAiMeta, DirectorCycleStage } from 'aidd-shared';
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

// Per-cycle progress the owning service holds in memory only: the stage a running cycle has
// reached, plus the direct-AI metadata that stage reported.
export interface ActiveCycleState {
	directAiMeta: DirectAiMeta | null;
	stage: DirectorCycleStage;
}

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
	/** Otherwise-eligible unfinished features whose dependencies are not all passing; excludes work
	 * awaiting approval. High relative to the open backlog
	 * means the project is topologically stalled: more feature work will not move it, the prerequisite
	 * chain has to be worked first. */
	dependencyBlockedCount: number;
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
	/** The project's basename, for reading. Not unique across the fleet; never match on it. */
	projectName: string;
	/**
	 * The project's unique route identity: the basename while it is unique, `basename~hash` once a
	 * second checkout shares it. This is the string a suggestion's `projectId` must carry, and the
	 * only one of the two that can name one working tree rather than a set of them.
	 */
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

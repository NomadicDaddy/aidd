import type { ActivityExecutionIdentity } from 'aidd-shared/runs/activity';

import type { DirectorHealthBand } from '../director.ts';
import type { MaturityBadge } from '../maturity.ts';
import type { FeatureStatusEntry, FeatureStatusType, FeatureSummary } from './features.ts';
import type { ProjectPorts } from './metadata.ts';
import type { PortStatusEntry } from './operations.ts';

/**
 * The Dashboard's read model — `GET /api/v1/projects/dashboard-summary`.
 *
 * Mirrors `backend/src/types/project/dashboardSummary.ts`. Every field is bounded or a count, so
 * the landing page no longer downloads every feature record of every project to render six rows.
 * `ProjectSummary` and `GET /api/v1/projects` are unchanged and still back the Projects page.
 */

export interface DashboardMilestoneChip {
	completed: number;
	name: string;
	total: number;
}

export interface DashboardArtifactCounts {
	fresh: number;
	missing: number;
	stale: number;
}

export interface DashboardProjectSummary {
	artifactCounts: DashboardArtifactCounts | null;
	artifactHealth: 'fresh' | 'missing' | 'stale' | 'unknown';
	featurePassing: number;
	featureSummary: FeatureSummary;
	featureTotal: number;
	hiddenMilestoneCount: number;
	id: string;
	maturity: MaturityBadge;
	milestoneCount: number;
	milestones: DashboardMilestoneChip[];
	name: string;
	orphaned: boolean;
	path: string;
	ports: null | ProjectPorts;
	portStatus: null | PortStatusEntry;
	priorityBand: DirectorHealthBand;
	priorityScore: number;
	routeId: string;
}

/** Row shape of the Feature Status table, projected by the server instead of flattened here. */
export interface DashboardFeatureStatusRow {
	completed: boolean;
	directory: string;
	priority: null | number | string;
	projectId: string;
	projectName: string;
	status: null | string;
	title: string;
	type: FeatureStatusType;
}

export interface DashboardFeatureStatusBucket {
	rows: DashboardFeatureStatusRow[];
	state: 'completed' | 'pending';
	total: number;
	type: FeatureStatusType;
}

export interface DashboardWaitingFeature {
	feature: FeatureStatusEntry;
	projectId: string;
	projectName: string;
}

/**
 * One fleet-wide activity row, derived on the server by `aidd-shared/runs/activity` — the same
 * module `recentActivityItems.ts` derives the project page's timeline with. `projectId` is the
 * route id, so the row links to its project.
 */
export interface DashboardActivityItem {
	durationMs: null | number;
	executionIdentity: ActivityExecutionIdentity | null;
	id: string;
	projectId: string;
	projectName: string;
	runId: null | string;
	sourceLabel: null | string;
	status: string;
	statusLabel: string;
	summary: null | string;
	timestamp: string;
	title: string;
	traceLabel: string;
}

export interface DashboardSummary {
	featureStatus: {
		buckets: DashboardFeatureStatusBucket[];
	};
	projects: DashboardProjectSummary[];
	recentActivity: {
		items: DashboardActivityItem[];
		total: number;
	};
	waitingApproval: {
		features: DashboardWaitingFeature[];
		total: number;
	};
}

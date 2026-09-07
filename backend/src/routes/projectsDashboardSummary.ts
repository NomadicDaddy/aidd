import { Elysia, t } from 'elysia';

import type { ProjectListingWithPriority } from '../services/project/listings/shared.ts';
import type { PortStatusMap } from '../services/project/portStatusService.ts';

import { buildDashboardSummary } from '../services/project/dashboardSummary.ts';

/**
 * What the route needs from the project service: the cached listing and the port probe. Narrowed
 * to these two so the group can be mounted against a stub in tests without a whole `WebContext`.
 */
export interface DashboardSummaryDeps {
	getPortStatus(): Promise<PortStatusMap>;
	listProjectListings(): Promise<{ projects: ProjectListingWithPriority[] }>;
}

const featureStatusType = t.Union([
	t.Literal('audit'),
	t.Literal('feature'),
	t.Literal('remediation'),
]);

const featurePriority = t.Union([t.Null(), t.Number(), t.String()]);

const featureSummary = t.Object({
	audit: t.Number(),
	completed: t.Number(),
	feature: t.Number(),
	pending: t.Number(),
	remediation: t.Number(),
	total: t.Number(),
});

const maturityStageId = t.Union([
	t.Literal('audited'),
	t.Literal('engaged'),
	t.Literal('mapped'),
	t.Literal('planned'),
	t.Literal('shipped'),
	t.Literal('specified'),
	t.Literal('structured'),
]);

// The badge, not the whole maturity model: seven fixed stage statuses and the next artifact.
const maturityBadge = t.Object({
	currentStageId: t.Union([t.Null(), maturityStageId]),
	currentStageLabel: t.Union([t.Null(), t.String()]),
	nextArtifactLabel: t.Union([t.Null(), t.String()]),
	nextArtifactSlug: t.Union([t.Null(), t.String()]),
	percent: t.Number(),
	stageStatuses: t.Array(
		t.Object({
			id: maturityStageId,
			label: t.String(),
			status: t.Union([t.Literal('complete'), t.Literal('empty'), t.Literal('partial')]),
		}),
	),
});

const activityItem = t.Object({
	durationMs: t.Union([t.Null(), t.Number()]),
	executionIdentity: t.Union([
		t.Null(),
		t.Object({
			backend: t.Union([t.Null(), t.String()]),
			model: t.Union([t.Null(), t.String()]),
			provider: t.Union([t.Null(), t.String()]),
			reasoningEffort: t.Union([t.Null(), t.String()]),
		}),
	]),
	id: t.String(),
	projectId: t.String(),
	projectName: t.String(),
	runId: t.Union([t.Null(), t.String()]),
	sourceLabel: t.Union([t.Null(), t.String()]),
	status: t.String(),
	statusLabel: t.String(),
	summary: t.Union([t.Null(), t.String()]),
	timestamp: t.String(),
	title: t.String(),
	traceLabel: t.String(),
});

const projectEntry = t.Object({
	artifactCounts: t.Union([
		t.Null(),
		t.Object({ fresh: t.Number(), missing: t.Number(), stale: t.Number() }),
	]),
	artifactHealth: t.Union([
		t.Literal('fresh'),
		t.Literal('missing'),
		t.Literal('stale'),
		t.Literal('unknown'),
	]),
	featurePassing: t.Number(),
	featureSummary,
	featureTotal: t.Number(),
	hiddenMilestoneCount: t.Number(),
	id: t.String(),
	maturity: maturityBadge,
	milestoneCount: t.Number(),
	milestones: t.Array(t.Object({ completed: t.Number(), name: t.String(), total: t.Number() })),
	name: t.String(),
	orphaned: t.Boolean(),
	path: t.String(),
	ports: t.Union([
		t.Null(),
		t.Object({
			backendPort: t.Union([t.Null(), t.Number()]),
			frontendPort: t.Union([t.Null(), t.Number()]),
		}),
	]),
	portStatus: t.Union([
		t.Null(),
		t.Object({
			backend: t.Union([t.Boolean(), t.Null()]),
			frontend: t.Union([t.Boolean(), t.Null()]),
		}),
	]),
	priorityBand: t.String(),
	priorityScore: t.Number(),
	routeId: t.String(),
});

const featureStatusRow = t.Object({
	completed: t.Boolean(),
	directory: t.String(),
	priority: featurePriority,
	projectId: t.String(),
	projectName: t.String(),
	status: t.Union([t.Null(), t.String()]),
	title: t.String(),
	type: featureStatusType,
});

/**
 * The response contract, validated on the way out. Elysia strips anything the schema does not
 * name, so a future field added to the project listing cannot silently reappear in the
 * Dashboard's payload — which is the failure this endpoint exists to prevent.
 */
export const dashboardSummaryResponse = t.Object({
	featureStatus: t.Object({
		buckets: t.Array(
			t.Object({
				rows: t.Array(featureStatusRow),
				state: t.Union([t.Literal('completed'), t.Literal('pending')]),
				total: t.Number(),
				type: featureStatusType,
			}),
		),
	}),
	projects: t.Array(projectEntry),
	recentActivity: t.Object({ items: t.Array(activityItem), total: t.Number() }),
	waitingApproval: t.Object({
		features: t.Array(
			t.Object({
				feature: t.Object({
					completed: t.Boolean(),
					directory: t.String(),
					id: t.String(),
					priority: featurePriority,
					status: t.Union([t.Null(), t.String()]),
					title: t.String(),
					type: featureStatusType,
					updatedAt: t.Union([t.Null(), t.String()]),
				}),
				projectId: t.String(),
				projectName: t.String(),
			}),
		),
		total: t.Number(),
	}),
});

// Mounted inside the `/api/v1/projects` route group, so this instance carries no prefix of its
// own: the parent's prefix is prepended when Elysia absorbs the plugin.
export function dashboardSummaryRouteGroup(deps: DashboardSummaryDeps, prefix: string) {
	return new Elysia({ prefix }).get(
		'/dashboard-summary',
		async () => {
			const [listings, portStatus] = await Promise.all([
				deps.listProjectListings(),
				deps.getPortStatus(),
			]);
			return buildDashboardSummary(
				listings.projects.map((listing) => listing.summary),
				portStatus,
			);
		},
		{ response: { 200: dashboardSummaryResponse } },
	);
}

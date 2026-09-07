import { recentActivityEntries } from 'aidd-shared/runs/activity';

import type { ProjectSummaryDto } from '../../types.ts';
import type {
	DashboardActivityItemDto,
	DashboardFeatureStatusBucketDto,
	DashboardFeatureStatusRowDto,
	DashboardMilestoneChipDto,
	DashboardProjectSummaryDto,
	DashboardSummaryResponseDto,
	DashboardWaitingFeatureDto,
} from '../../types/project/dashboardSummary.ts';
import type { WebFeatureStatusType } from '../../types/project/features.ts';
import type { PortStatusMap } from './portStatusService.ts';

/** Rows a Dashboard card renders before it defers to its "see all" link. */
export const DASHBOARD_PREVIEW_ROWS = 6;

/** Milestone chips a Project Health row prints before it collapses the rest into `+N`. */
const MILESTONE_CHIPS = 3;

const FEATURE_STATUS_TYPES: WebFeatureStatusType[] = ['audit', 'feature', 'remediation'];
const FEATURE_STATUS_STATES = ['completed', 'pending'] as const;

// Archived copies are hidden from the fleet rollups, matching what the Dashboard has always
// filtered out client-side. They stay in `projects` so a suggestion naming one still resolves to
// a route.
function countsTowardFleetRollups(project: ProjectSummaryDto): boolean {
	return !project.name.endsWith('.old');
}

function milestoneChips(project: ProjectSummaryDto): DashboardMilestoneChipDto[] {
	const roadmap = project.metadata.roadmap;
	if (!roadmap) return [];
	const chips: DashboardMilestoneChipDto[] = [];
	for (const name of roadmap.milestoneOrder.slice(0, MILESTONE_CHIPS)) {
		const milestone = roadmap.milestones[name];
		if (!milestone) continue;
		chips.push({ completed: milestone.completed, name, total: milestone.total });
	}
	return chips;
}

function projectEntry(
	project: ProjectSummaryDto,
	portStatus: PortStatusMap,
): DashboardProjectSummaryDto {
	const artifactSummary = project.metadata.artifactCheck?.summary ?? null;
	const maturity = project.metadata.maturity;
	const milestoneCount = project.metadata.roadmap?.milestoneOrder.length ?? 0;
	const sync = project.metadata.sync;
	return {
		artifactCounts: artifactSummary
			? {
					fresh: artifactSummary.fresh,
					missing: artifactSummary.missing,
					stale: artifactSummary.stale,
				}
			: null,
		artifactHealth: project.artifactHealth,
		featurePassing: project.featureStats.passing,
		featureSummary: project.featureSummary,
		featureTotal: project.featureStats.total,
		hiddenMilestoneCount: Math.max(milestoneCount - MILESTONE_CHIPS, 0),
		id: project.id,
		// Copied field by field rather than spread: the badge is the only part of the maturity
		// model that belongs in a bounded payload, and a spread would carry whatever is added to
		// it next.
		maturity: {
			currentStageId: maturity.currentStageId,
			currentStageLabel: maturity.currentStageLabel,
			nextArtifactLabel: maturity.nextArtifactLabel,
			nextArtifactSlug: maturity.nextArtifactSlug,
			percent: maturity.percent,
			stageStatuses: maturity.stageStatuses,
		},
		milestoneCount,
		milestones: milestoneChips(project),
		name: project.name,
		orphaned:
			sync.syncState === 'error' && (sync.lastSyncError?.startsWith('ORPHAN:') ?? false),
		path: project.path,
		ports: project.metadata.ports,
		portStatus: portStatus[project.id] ?? null,
		priorityBand: project.priorityHealth.band,
		priorityScore: project.priorityHealth.score,
		routeId: project.routeId,
	};
}

// Every feature row of every rolled-up project, in the order the card used to produce by
// flattening and sorting in the browser: project name, then feature directory. Only the first
// `DASHBOARD_PREVIEW_ROWS` of each bucket survive into the response.
function allFeatureRows(projects: ProjectSummaryDto[]): DashboardFeatureStatusRowDto[] {
	const rows: DashboardFeatureStatusRowDto[] = [];
	for (const project of projects) {
		for (const feature of project.featureStatus) {
			rows.push({
				completed: feature.completed,
				directory: feature.directory,
				priority: feature.priority,
				projectId: project.routeId,
				projectName: project.name,
				status: feature.status,
				title: feature.title,
				type: feature.type,
			});
		}
	}
	return rows.sort((left, right) => {
		const byProject = left.projectName.localeCompare(right.projectName);
		if (byProject !== 0) return byProject;
		return left.directory.localeCompare(right.directory);
	});
}

// The fleet timeline, newest first. Ordering, status labels and execution identity come from
// `aidd-shared/runs/activity` — the same derivation the project page renders — so a row here says
// what the project's own history says about the same run.
//
// Each project contributes at most `DASHBOARD_PREVIEW_ROWS` entries before the merge, which is
// every entry that could survive it, and the merged list is cut to that same count. `total` is the
// unbounded count, so the card can say how much it is not showing.
function fleetActivity(projects: ProjectSummaryDto[]): {
	items: DashboardActivityItemDto[];
	total: number;
} {
	const items: DashboardActivityItemDto[] = [];
	let total = 0;
	for (const project of projects) {
		const entries = recentActivityEntries(
			project.metadata.localRuns,
			project.metadata.localIterations,
		);
		total += entries.length;
		for (const entry of entries.slice(0, DASHBOARD_PREVIEW_ROWS)) {
			items.push({
				durationMs: entry.durationMs,
				executionIdentity: entry.executionIdentity,
				// Entry ids are unique within a project; the fleet list holds several projects.
				id: `${project.routeId}:${entry.id}`,
				projectId: project.routeId,
				projectName: project.name,
				runId: entry.runId,
				sourceLabel: entry.sourceLabel,
				status: entry.status,
				statusLabel: entry.statusLabel,
				summary: entry.summary,
				timestamp: entry.timestamp,
				title: entry.title,
				traceLabel: entry.traceLabel,
			});
		}
	}
	items.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
	return { items: items.slice(0, DASHBOARD_PREVIEW_ROWS), total };
}

function featureStatusBuckets(projects: ProjectSummaryDto[]): DashboardFeatureStatusBucketDto[] {
	const rows = allFeatureRows(projects);
	const buckets: DashboardFeatureStatusBucketDto[] = [];
	for (const state of FEATURE_STATUS_STATES) {
		for (const type of FEATURE_STATUS_TYPES) {
			const matching = rows.filter(
				(row) => row.type === type && row.completed === (state === 'completed'),
			);
			buckets.push({
				rows: matching.slice(0, DASHBOARD_PREVIEW_ROWS),
				state,
				total: matching.length,
				type,
			});
		}
	}
	return buckets;
}

function waitingApproval(projects: ProjectSummaryDto[]): {
	features: DashboardWaitingFeatureDto[];
	total: number;
} {
	const features: DashboardWaitingFeatureDto[] = [];
	let total = 0;
	for (const project of projects) {
		for (const feature of project.featureStatus) {
			if (feature.status !== 'waiting_approval') continue;
			total += 1;
			if (features.length < DASHBOARD_PREVIEW_ROWS) {
				features.push({ feature, projectId: project.id, projectName: project.name });
			}
		}
	}
	return { features, total };
}

/**
 * Project the full listing down to what the Dashboard renders.
 *
 * The caller supplies listings straight from the project listing cache, so this adds no
 * filesystem work of its own — it is the boundary that keeps 2,698 feature records from crossing
 * the wire to paint six rows.
 * @param summaries Project listings straight from the listing cache.
 * @param portStatus Listen state per project id, folded in so the page needs no second request.
 * @returns The bounded read model the Dashboard renders.
 */
export function buildDashboardSummary(
	summaries: ProjectSummaryDto[],
	portStatus: PortStatusMap,
): DashboardSummaryResponseDto {
	const ordered = [...summaries].sort((left, right) => left.name.localeCompare(right.name));
	const rolledUp = ordered.filter(countsTowardFleetRollups);
	return {
		featureStatus: { buckets: featureStatusBuckets(rolledUp) },
		projects: ordered.map((project) => projectEntry(project, portStatus)),
		recentActivity: fleetActivity(rolledUp),
		waitingApproval: waitingApproval(rolledUp),
	};
}

import type { ActivityExecutionIdentity } from 'aidd-shared/runs/activity';

import type { DirectorHealthBand } from '../director.ts';
import type { MaturityBadgeDto } from '../maturity.ts';
import type {
	WebFeatureStatusEntryDto,
	WebFeatureStatusType,
	WebFeatureSummaryDto,
} from './features.ts';
import type { ProjectPorts } from './metadata.ts';

/**
 * The Dashboard's own read model.
 *
 * The landing page renders at most six rows per card, but it used to get there by downloading
 * every feature record of every discovered project — 2,698 records and 1.4 MB on this fleet — and
 * flattening them in the browser. Every field below is either bounded by construction or a count,
 * so the response grows with the number of projects and not with the number of features.
 *
 * This is additive: `GET /api/v1/projects` still answers with the full listing for the Projects
 * page and for anything else that needs whole records.
 */

/** Live listen state of a project's two conventional ports. */
export interface DashboardPortStatusDto {
	backend: boolean | null;
	frontend: boolean | null;
}

/** One milestone chip: name plus its completion counts. */
export interface DashboardMilestoneChipDto {
	completed: number;
	name: string;
	total: number;
}

/** Artifact freshness counts, already reduced to the three the row prints. */
export interface DashboardArtifactCountsDto {
	fresh: number;
	missing: number;
	stale: number;
}

/** Per-project health, exactly the fields the Project Health and Feature Summary cards read. */
export interface DashboardProjectSummaryDto {
	artifactCounts: DashboardArtifactCountsDto | null;
	artifactHealth: 'fresh' | 'missing' | 'stale' | 'unknown';
	featurePassing: number;
	featureSummary: WebFeatureSummaryDto;
	featureTotal: number;
	/** Milestones beyond the three in `milestones`, for the `+N` chip. */
	hiddenMilestoneCount: number;
	id: string;
	/** Stage badge and progress, the fixed-length projection the Maturity card reads. */
	maturity: MaturityBadgeDto;
	/** Full milestone count; `milestones` is capped at three. */
	milestoneCount: number;
	milestones: DashboardMilestoneChipDto[];
	name: string;
	/** The project directory is gone from disk (sync reported an ORPHAN). */
	orphaned: boolean;
	path: string;
	ports: null | ProjectPorts;
	portStatus: DashboardPortStatusDto | null;
	priorityBand: DirectorHealthBand;
	priorityScore: number;
	routeId: string;
}

/** One fleet-wide feature row in the Feature Status preview. */
export interface DashboardFeatureStatusRowDto {
	completed: boolean;
	directory: string;
	priority: null | number | string;
	/** Route id, because the row links to the project's features tab. */
	projectId: string;
	projectName: string;
	status: null | string;
	title: string;
	type: WebFeatureStatusType;
}

/**
 * One (state, type) cell of the Feature Status filter grid: its true row count plus the rows the
 * card would show if that filter were selected. The six buckets partition every feature record,
 * so the card's "N total" readout is their summed totals.
 */
export interface DashboardFeatureStatusBucketDto {
	rows: DashboardFeatureStatusRowDto[];
	state: 'completed' | 'pending';
	total: number;
	type: WebFeatureStatusType;
}

/**
 * A feature parked on `waiting_approval`. `projectId` is the opaque project id the approve and
 * dismiss mutations take, not the route id the Feature Status rows link with.
 */
export interface DashboardWaitingFeatureDto {
	feature: WebFeatureStatusEntryDto;
	projectId: string;
	projectName: string;
}

/**
 * One fleet-wide activity row. Derived by `aidd-shared/runs/activity` from the same local run and
 * iteration records the project page reads, so the two surfaces cannot disagree about what a run
 * did. `projectId` is the route id, because the row links to the project's history.
 *
 * The commits a run recorded are left off: they are unbounded per run, and this preview links to
 * the project rather than reproducing its timeline.
 */
export interface DashboardActivityItemDto {
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

export interface DashboardSummaryResponseDto {
	featureStatus: {
		buckets: DashboardFeatureStatusBucketDto[];
	};
	projects: DashboardProjectSummaryDto[];
	recentActivity: {
		items: DashboardActivityItemDto[];
		total: number;
	};
	waitingApproval: {
		features: DashboardWaitingFeatureDto[];
		total: number;
	};
}

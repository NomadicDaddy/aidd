import type {
	CrossMilestoneViolation,
	MilestoneMove,
	MilestonePriorityUpdate,
	MilestoneWarning,
} from 'aidd-shared/metadata/roadmap-milestones';

export type {
	MilestoneMove,
	MilestoneMoveReason,
	MilestoneWarningCode,
} from 'aidd-shared/metadata/roadmap-milestones';

export interface ProjectMilestone {
	completed: number;
	description: null | string;
	featureDirectories: string[];
	name: string;
	priority: number;
	total: number;
}

/** The editable milestone view — `ProjectRoadmapSummary` drops `description` and `priority`. */
export interface ProjectMilestonesView {
	activeMilestone: null | string;
	gateBlocked: boolean;
	lifecycle: 'active' | 'locked' | 'lts';
	/** In coding-gate order (ascending priority), not key order. */
	milestones: ProjectMilestone[];
	unmappedFeatureDirectories: string[];
	violations: CrossMilestoneViolation[];
}

/**
 * Preview and apply return the same payload, which is what lets the plan dialog show exactly what
 * the confirm will do: the confirm re-issues the identical request with `dryRun` cleared.
 */
export interface ProjectMilestonePlan {
	applied: boolean;
	moves: MilestoneMove[];
	priorityUpdates: MilestonePriorityUpdate[];
	view: ProjectMilestonesView;
	violations: CrossMilestoneViolation[];
	warnings: MilestoneWarning[];
}

export interface MilestoneCreateInput {
	description?: string;
	dryRun?: boolean;
	name: string;
	position?: number;
}

export interface MilestoneUpdateInput {
	description?: string;
	dryRun?: boolean;
	name?: string;
	position?: number;
}

export interface MilestoneDeleteInput {
	dryRun?: boolean;
	targetMilestone?: string;
}

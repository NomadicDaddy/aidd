import type {
	CrossMilestoneViolation,
	MilestoneMove,
	MilestonePriorityUpdate,
	MilestoneWarning,
	ShippedVersionBackfill,
} from 'aidd-shared/metadata/roadmap-milestones';

export type {
	CrossMilestoneViolation,
	MilestoneMove,
	MilestonePriorityUpdate,
	MilestoneWarning,
	ShippedVersionBackfill,
} from 'aidd-shared/metadata/roadmap-milestones';

export interface ProjectMilestoneDto {
	completed: number;
	description: null | string;
	featureDirectories: string[];
	name: string;
	priority: number;
	total: number;
}

/**
 * The editable milestone view. `ProjectMetadataDto`'s roadmap summary cannot stand in for it: that
 * one drops `description` and `priority`, which are exactly the fields this surface edits.
 */
export interface ProjectMilestonesViewDto {
	activeMilestone: null | string;
	gateBlocked: boolean;
	lifecycle: 'active' | 'locked' | 'lts';
	/** In `orderedMilestoneNames` order — the order the coding gate actually walks. */
	milestones: ProjectMilestoneDto[];
	unmappedFeatureDirectories: string[];
	violations: CrossMilestoneViolation[];
}

/**
 * Preview and apply return the same shape, so the confirm dialog renders one payload and the apply
 * is the identical request with `dryRun` cleared. `applied` is the only field that differs.
 */
export interface ProjectMilestonePlanDto {
	applied: boolean;
	/** Completed features whose missing `shippedVersion` will be stamped with the app's version. */
	backfills: ShippedVersionBackfill[];
	moves: MilestoneMove[];
	priorityUpdates: MilestonePriorityUpdate[];
	view: ProjectMilestonesViewDto;
	violations: CrossMilestoneViolation[];
	warnings: MilestoneWarning[];
}

export interface MilestoneCreateInputDto {
	description?: string;
	dryRun?: boolean;
	name: string;
	position?: number;
}

export interface MilestoneUpdateInputDto {
	description?: string;
	dryRun?: boolean;
	name?: string;
	position?: number;
}

export interface MilestoneDeleteInputDto {
	dryRun?: boolean;
	targetMilestone?: string;
}

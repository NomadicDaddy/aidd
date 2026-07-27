import type { Roadmap } from '../roadmap.ts';

/**
 * A feature scheduled earlier than something it depends on. The runtime gate admits only the active
 * milestone's directories, so the later dependency can never pass while the earlier milestone is
 * active — the dependent is permanently unselectable. `evaluateRoadmapCodingGate` does not detect
 * this: it reports `blocked: false` and the run ends "all candidates dependency-blocked" with no
 * cause named. Surfacing it is the whole point of planning milestone edits rather than applying them.
 */
export interface CrossMilestoneViolation {
	/** Canonical node id (`directory ?? id`) of the depended-on feature. */
	dependency: string;
	dependencyMilestone: string;
	featureDirectory: string;
	milestone: string;
}

/**
 * Why a feature moved. `unmapped` covers features with no valid milestone at all — they block every
 * coding run project-wide (`blockReason: 'unmapped_features'`), so any plan repairs them.
 */
export type MilestoneMoveReason = 'delete-cascade' | 'dependency' | 'rename' | 'unmapped';

export interface MilestoneMove {
	featureDirectory: string;
	from: null | string;
	reason: MilestoneMoveReason;
	to: string;
}

/**
 * feature.json `priority` mirrors its milestone's priority — both `syncFeaturePriority` and
 * `aidd-tools roadmap:apply` write it that way. Renumbering milestones or moving a feature therefore
 * has feature-file side effects, and leaving them unapplied shows up later as roadmap:apply drift.
 */
export interface MilestonePriorityUpdate {
	featureDirectory: string;
	from: null | number;
	to: number;
}

export type MilestoneWarningCode =
	'dangling_dependency' | 'dependency_cycle' | 'mvp_status_mismatch';

export interface MilestoneWarning {
	code: MilestoneWarningCode;
	detail: string;
	featureDirectory: string;
}

export interface MilestonePlan {
	moves: MilestoneMove[];
	priorityUpdates: MilestonePriorityUpdate[];
	/** The resulting roadmap, ready to hand to `FileAiddStore.writeRoadmap`. */
	roadmap: Roadmap;
	/** Violations planning could not repair — every one of these is bound up in a dependency cycle. */
	violations: CrossMilestoneViolation[];
	warnings: MilestoneWarning[];
}

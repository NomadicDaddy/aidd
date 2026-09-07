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
	/**
	 * Whether the depending feature already passes. A violation on a completed feature is roadmap
	 * accounting after the fact: the ordering is wrong on paper, but there is no work left for it to
	 * strand. One on an unfinished feature is the real thing -- that feature can never be selected
	 * while its own milestone is active, and the gate reports nothing.
	 */
	featurePasses: boolean;
	milestone: string;
}

/**
 * Why a feature moved. `unmapped` covers features with no valid milestone at all — they block every
 * coding run project-wide (`blockReason: 'unmapped_features'`), so any plan repairs them.
 * `shipped-version` re-homes a completed feature into the milestone matching the version it
 * actually shipped in (see version-mapping.ts).
 */
export type MilestoneMoveReason =
	'delete-cascade' | 'dependency' | 'rename' | 'shipped-version' | 'unmapped';

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

/**
 * A completed feature that never got `shippedVersion` stamped, to be repaired with the app's
 * current version. Settling one rewrites feature.json, so appliers must treat backfills as
 * disruptive the same way they treat priority updates.
 */
export interface ShippedVersionBackfill {
	featureDirectory: string;
	shippedVersion: string;
}

export interface MilestonePlan {
	backfills: ShippedVersionBackfill[];
	moves: MilestoneMove[];
	priorityUpdates: MilestonePriorityUpdate[];
	/** The resulting roadmap, ready to hand to `FileAiddStore.writeRoadmap`. */
	roadmap: Roadmap;
	/** Violations planning could not repair — every one of these is bound up in a dependency cycle. */
	violations: CrossMilestoneViolation[];
	warnings: MilestoneWarning[];
}

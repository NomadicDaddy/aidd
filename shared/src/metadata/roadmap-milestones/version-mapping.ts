import type { Feature } from '../features.ts';
import type { Roadmap } from '../roadmap.ts';
import type { MilestoneMove, ShippedVersionBackfill } from './types.ts';

import { featureNodeId } from '../features.ts';
import { orderedMilestoneNames } from '../roadmap.ts';

interface VersionBound {
	major: number;
	minor: number;
}

/**
 * Version-named milestones (`v<major>.<minor>`, the same shape `computeNextMilestoneName` emits)
 * double as version range bounds. Anything else — `MVP`, `Backlog` — is not a bound: it can still
 * receive pre-first-version features as the first milestone, but never participates in range math.
 */
function parseMilestoneVersionBound(name: string): null | VersionBound {
	const match = /^v(\d+)\.(\d+)$/.exec(name);
	if (!match) return null;
	return { major: Number(match[1]), minor: Number(match[2]) };
}

/** Accepts `1.4.1`, `v1.4.1`, `1.4`, prerelease/build suffixes. Patch and suffix are ignored —
 *  milestone bounds only carry major.minor, so `1.999.3` still compares below `2.0`. */
function parseShippedVersion(value: string): null | VersionBound {
	const match = /^v?(\d+)\.(\d+)(?:\.\d+)?(?:[-+].*)?$/.exec(value.trim());
	if (!match) return null;
	return { major: Number(match[1]), minor: Number(match[2]) };
}

function compareBounds(a: VersionBound, b: VersionBound): number {
	return a.major - b.major || a.minor - b.minor;
}

/**
 * The milestone whose version range contains `shippedVersion`: the greatest version-named bound at
 * or below it, so the last milestone is open-ended upward. Below every bound falls into the first
 * milestone in priority order (the MVP-style bucket, whatever its name). Null — meaning "no
 * opinion, leave the mapping alone" — when the version is unparseable or the roadmap has no
 * version-named milestones at all.
 */
export function milestoneForShippedVersion(
	roadmap: Roadmap,
	shippedVersion: string,
): null | string {
	const shipped = parseShippedVersion(shippedVersion);
	if (shipped === null) return null;
	const ordered = orderedMilestoneNames(roadmap);
	const bounds = ordered
		.map((name) => ({ bound: parseMilestoneVersionBound(name), name }))
		.filter((entry): entry is { bound: VersionBound; name: string } => entry.bound !== null)
		.sort((a, b) => compareBounds(a.bound, b.bound));
	if (bounds.length === 0) return null;
	let target: null | string = null;
	for (const entry of bounds) {
		if (compareBounds(entry.bound, shipped) > 0) break;
		target = entry.name;
	}
	return target ?? ordered[0] ?? null;
}

export interface ShippedPlacementReconciliation {
	backfills: ShippedVersionBackfill[];
	seedMoves: MilestoneMove[];
}

/**
 * Completed features are history: they belong in the milestone matching the version they actually
 * shipped in, not wherever intake happened to file them (audit findings land in the "active"
 * milestone, which drifts past the real version line once earlier milestones finish). Only
 * completed features are considered — incomplete work is planning, and re-homing it is the
 * dependency pass's job, which deliberately never pulls features earlier.
 *
 * Moves only ever pull a feature BACK from a milestone ahead of its shipped version, never push it
 * forward out of an earlier one: `shippedVersion` records the latest revision, not original
 * delivery, so an MVP feature touched again in 1.4 still belongs to MVP. A mapping pointing at no
 * known milestone has no position to respect and is seeded outright.
 *
 * A completed feature with no `shippedVersion` is placed by `appVersion` (the target app's current
 * package.json version) and gets a backfill entry so the omission is repaired, not re-derived on
 * every pass. Features with neither version are left alone.
 */
export function reconcileShippedPlacement(
	roadmap: Roadmap,
	features: Feature[],
	appVersion: null | string,
): ShippedPlacementReconciliation {
	const backfills: ShippedVersionBackfill[] = [];
	const seedMoves: MilestoneMove[] = [];
	const rank = new Map(orderedMilestoneNames(roadmap).map((name, index) => [name, index]));
	const fallback =
		appVersion !== null && parseShippedVersion(appVersion) !== null ? appVersion : null;
	for (const feature of features) {
		if (feature.status !== 'completed') continue;
		const directory = featureNodeId(feature);
		const effective = feature.shippedVersion ?? fallback;
		if (effective === null || effective === undefined) continue;
		if (feature.shippedVersion === undefined && fallback !== null) {
			backfills.push({ featureDirectory: directory, shippedVersion: fallback });
		}
		const target = milestoneForShippedVersion(roadmap, effective);
		if (target === null) continue;
		const current = roadmap.features[directory]?.milestone ?? null;
		if (current === target) continue;
		const currentRank = current === null ? undefined : rank.get(current);
		const targetRank = rank.get(target);
		if (currentRank !== undefined && targetRank !== undefined && targetRank >= currentRank) {
			continue;
		}
		seedMoves.push({
			featureDirectory: directory,
			from: current,
			reason: 'shipped-version',
			to: target,
		});
	}
	backfills.sort((a, b) => a.featureDirectory.localeCompare(b.featureDirectory));
	return { backfills, seedMoves };
}

/** Roadmap with one feature remapped; everything else untouched. */
export function withFeatureMilestone(
	roadmap: Roadmap,
	directory: string,
	milestone: string,
): Roadmap {
	return {
		...roadmap,
		features: {
			...roadmap.features,
			[directory]: { ...(roadmap.features[directory] ?? {}), milestone },
		},
	};
}

/**
 * The store-write variant of the same rule: the milestone a completed, version-stamped feature
 * should occupy, or null when the current mapping already agrees, sits earlier (pull-back only —
 * see reconcileShippedPlacement), or the rule has no opinion.
 */
export function shippedMilestoneOverride(roadmap: Roadmap, feature: Feature): null | string {
	if (feature.status !== 'completed' || feature.shippedVersion === undefined) return null;
	const target = milestoneForShippedVersion(roadmap, feature.shippedVersion);
	if (target === null || roadmap.milestones[target] === undefined) return null;
	const ordered = orderedMilestoneNames(roadmap);
	const current = roadmap.features[featureNodeId(feature)]?.milestone;
	const currentRank = current === undefined ? -1 : ordered.indexOf(current);
	const targetRank = ordered.indexOf(target);
	return currentRank !== -1 && targetRank >= currentRank ? null : target;
}

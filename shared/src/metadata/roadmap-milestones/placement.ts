import type { Feature } from '../features.ts';
import type { Roadmap } from '../roadmap.ts';
import type {
	MilestoneMove,
	MilestoneMoveReason,
	MilestonePlan,
	MilestonePriorityUpdate,
	MilestoneWarning,
} from './types.ts';

import { featureNodeId, isAuditFinding, isRemediationFeature } from '../features.ts';
import { orderedMilestoneNames } from '../roadmap.ts';
import { isMilestoneBeyondMvp } from '../store/status-policy.ts';
import {
	dependencyEdges,
	findCrossMilestoneViolations,
	milestoneRanks,
	normalizeMilestonePriorities,
	topologicalOrder,
} from './graph.ts';

/**
 * Repairs feature placement against the dependency graph and produces the applyable plan.
 *
 * `roadmap` must already carry the caller's intended milestone set (created/renamed/deleted);
 * `seedMoves` states where the caller wants specific features to land. Everything else — repairing
 * unmapped features, pushing dependents past their dependencies, renumbering priorities, and
 * propagating those priorities into feature.json — happens here, so every milestone operation shares
 * one placement rule instead of each re-deriving it.
 *
 * Placement only ever moves a feature **later**. Pulling a dependency earlier would satisfy the same
 * constraint, but it grows the milestone the gate is currently admitting work from — silently, and
 * possibly while a run is in flight. Pushing the dependent is the choice that cannot surprise a
 * running agent.
 */
export function repairPlacement(
	roadmap: Roadmap,
	features: Feature[],
	seedMoves: MilestoneMove[] = [],
): MilestonePlan {
	const normalized = normalizeMilestonePriorities(roadmap);
	const ordered = orderedMilestoneNames(normalized);
	if (ordered.length === 0) {
		return {
			moves: [],
			priorityUpdates: [],
			roadmap: normalized,
			violations: [],
			warnings: [],
		};
	}

	const ranks = milestoneRanks(normalized);
	const lastRank = ordered.length - 1;
	const seeds = new Map(seedMoves.map((move) => [move.featureDirectory, move]));
	const startRank = new Map<string, number>();
	const reasons = new Map<string, MilestoneMoveReason>();
	const original = new Map<string, null | string>();
	const nodes = placementNodes(normalized, features);

	for (const node of nodes) {
		const current = normalized.features[node]?.milestone ?? null;
		original.set(node, current);
		const seed = seeds.get(node);
		const seeded = seed === undefined ? undefined : ranks.get(seed.to);
		if (seed !== undefined && seeded !== undefined) {
			startRank.set(node, seeded);
			reasons.set(node, seed.reason);
			continue;
		}
		const rank = current === null ? undefined : ranks.get(current);
		if (rank === undefined) {
			// No valid mapping. This is the state that blocks every coding run project-wide, so it
			// is repaired on any write — into the last milestone, the one bucket where landing extra
			// work cannot inflate what the gate is currently admitting.
			startRank.set(node, lastRank);
			reasons.set(node, 'unmapped');
			continue;
		}
		startRank.set(node, rank);
	}

	const { dangling, requires } = dependencyEdges(normalized, features);
	const finalRank = new Map(startRank);
	const order = topologicalOrder(requires);
	for (const node of order) {
		let rank = finalRank.get(node) ?? lastRank;
		for (const dependency of requires.get(node) ?? []) {
			const dependencyRank = finalRank.get(dependency);
			if (dependencyRank !== undefined && dependencyRank > rank) rank = dependencyRank;
		}
		finalRank.set(node, rank);
		if (rank > (startRank.get(node) ?? rank)) reasons.set(node, 'dependency');
	}

	const featureEntries = { ...normalized.features };
	const moves: MilestoneMove[] = [];
	for (const node of nodes) {
		const target = ordered[finalRank.get(node) ?? lastRank];
		if (target === undefined) continue;
		const from = original.get(node) ?? null;
		if (from === target) continue;
		featureEntries[node] = { ...(featureEntries[node] ?? {}), milestone: target };
		moves.push({
			featureDirectory: node,
			from,
			reason: reasons.get(node) ?? 'dependency',
			to: target,
		});
	}
	moves.sort((a, b) => a.featureDirectory.localeCompare(b.featureDirectory));

	const planned: Roadmap = { ...normalized, features: featureEntries };
	const placed = new Set(order);
	const cycleBound = [...requires.keys()].filter((node) => !placed.has(node)).sort();

	return {
		moves,
		priorityUpdates: collectPriorityUpdates(planned, features, finalRank, ordered),
		roadmap: planned,
		violations: findCrossMilestoneViolations(planned, features),
		warnings: collectWarnings({ cycleBound, dangling, features, moves, roadmap: planned }),
	};
}

/**
 * Every node placement must account for: the features on disk, **plus** every key already in
 * `roadmap.features`.
 *
 * The second half is not redundant. `listFeatures()` silently drops any feature whose `feature.json`
 * is missing or unparseable, so a roadmap entry can outlive its readable feature. Placing only the
 * supplied features would leave such an entry pointing at a milestone this very operation renamed or
 * deleted — precisely the `invalid_milestone_mapping` state that blocks every coding run
 * project-wide, written by the tool built to prevent it.
 */
function placementNodes(roadmap: Roadmap, features: Feature[]): string[] {
	const nodes = new Set(features.map((feature) => featureNodeId(feature)));
	for (const node of Object.keys(roadmap.features)) nodes.add(node);
	return [...nodes];
}

function collectPriorityUpdates(
	roadmap: Roadmap,
	features: Feature[],
	finalRank: Map<string, number>,
	ordered: string[],
): MilestonePriorityUpdate[] {
	const updates: MilestonePriorityUpdate[] = [];
	for (const feature of features) {
		const node = featureNodeId(feature);
		const rank = finalRank.get(node);
		const milestone = rank === undefined ? undefined : ordered[rank];
		const priority =
			milestone === undefined ? undefined : roadmap.milestones[milestone]?.priority;
		if (priority === undefined) continue;
		const parsed = feature.priority === undefined ? Number.NaN : Number(feature.priority);
		const from = Number.isNaN(parsed) ? null : parsed;
		if (from === priority) continue;
		updates.push({ featureDirectory: node, from, to: priority });
	}
	return updates.sort((a, b) => a.featureDirectory.localeCompare(b.featureDirectory));
}

interface WarningInput {
	cycleBound: string[];
	dangling: { featureDirectory: string; ref: string }[];
	features: Feature[];
	moves: MilestoneMove[];
	roadmap: Roadmap;
}

function collectWarnings(input: WarningInput): MilestoneWarning[] {
	const warnings: MilestoneWarning[] = [];
	for (const node of input.cycleBound) {
		warnings.push({
			code: 'dependency_cycle',
			detail: 'In or behind a dependency cycle — left in place, its ordering cannot be repaired.',
			featureDirectory: node,
		});
	}
	for (const entry of input.dangling) {
		warnings.push({
			code: 'dangling_dependency',
			detail: `Depends on '${entry.ref}', which matches no feature on disk.`,
			featureDirectory: entry.featureDirectory,
		});
	}
	warnings.push(...collectMvpStatusWarnings(input));
	return warnings.sort(
		(a, b) =>
			a.featureDirectory.localeCompare(b.featureDirectory) || a.code.localeCompare(b.code),
	);
}

/**
 * The blueprint gate wants MVP features `backlog` and everything past MVP `waiting_approval`, but
 * `applyCreationStatusPolicy` only runs at feature creation — moving one across the MVP boundary
 * never restatuses it. Reported, never applied: restatusing work is a decision, not a side effect of
 * reordering a roadmap.
 */
function collectMvpStatusWarnings(input: WarningInput): MilestoneWarning[] {
	const byNode = new Map(input.features.map((feature) => [featureNodeId(feature), feature]));
	const warnings: MilestoneWarning[] = [];
	for (const move of input.moves) {
		const feature = byNode.get(move.featureDirectory);
		if (!feature || isAuditFinding(feature) || isRemediationFeature(feature)) continue;
		const beyond = isMilestoneBeyondMvp(input.roadmap, move.to);
		if (beyond && feature.status === 'backlog') {
			warnings.push({
				code: 'mvp_status_mismatch',
				detail: `Moves past MVP to '${move.to}' while still 'backlog' — the blueprint gate expects 'waiting_approval'.`,
				featureDirectory: move.featureDirectory,
			});
			continue;
		}
		if (!beyond && feature.status === 'waiting_approval') {
			warnings.push({
				code: 'mvp_status_mismatch',
				detail: `Moves into '${move.to}' while still 'waiting_approval' — the blueprint gate expects 'backlog'.`,
				featureDirectory: move.featureDirectory,
			});
		}
	}
	return warnings;
}

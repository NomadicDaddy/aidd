import type { Feature } from '../features.ts';
import type { Roadmap } from '../roadmap.ts';
import type { CrossMilestoneViolation } from './types.ts';

import { featureNodeId } from '../features/graph.ts';
import { indexFeaturesByRef } from '../features/indexByRef.ts';
import { isFeatureComplete } from '../features/query.ts';
import { orderedMilestoneNames } from '../roadmap.ts';

/** Milestone name to its position in priority order — lower rank runs earlier. */
export function milestoneRanks(roadmap: Roadmap): Map<string, number> {
	const ranks = new Map<string, number>();
	orderedMilestoneNames(roadmap).forEach((name, index) => ranks.set(name, index));
	return ranks;
}

/**
 * Renumber every milestone to a contiguous 1..N in current priority order. `roadmapMilestoneSchema`
 * marks `priority` optional, but `aidd-tools roadmap:apply` throws on a milestone without one and
 * `orderedMilestoneNames` silently sorts an absent priority last — so a hand-edited roadmap can order
 * one way for the gate and another for apply. Normalizing on every write removes that whole class.
 */
export function normalizeMilestonePriorities(roadmap: Roadmap): Roadmap {
	const milestones: Roadmap['milestones'] = {};
	orderedMilestoneNames(roadmap).forEach((name, index) => {
		const entry = roadmap.milestones[name];
		if (entry) milestones[name] = { ...entry, priority: index + 1 };
	});
	return { ...roadmap, milestones };
}

export interface DependencyEdges {
	/** Refs matching no feature on disk. Permanently unsatisfiable, so worth reporting on the way past. */
	dangling: { featureDirectory: string; ref: string }[];
	/** Canonical node id to the canonical node ids it depends on. */
	requires: Map<string, string[]>;
}

/**
 * Resolves both dependency key spaces at once. feature.json `dependencies` are written by feature
 * **id**; roadmap.json `features[dir].dependencies` are written by **directory**. They coincide
 * except in spernakit-derived projects, where ids look like `spernakit-<ts>-<slug>` and directories
 * are short — exactly the case a hand-written list goes stale in. `indexFeaturesByRef` is the single
 * source of the both-keys-resolve rule; the gate and the graph builder share it.
 */
export function dependencyEdges(roadmap: Roadmap, features: Feature[]): DependencyEdges {
	const byRef = indexFeaturesByRef(features);
	const requires = new Map<string, string[]>();
	const dangling: { featureDirectory: string; ref: string }[] = [];
	for (const feature of features) {
		const node = featureNodeId(feature);
		const refs = new Set([
			...(feature.dependencies ?? []),
			...(roadmap.features[node]?.dependencies ?? []),
		]);
		const targets = new Set<string>();
		for (const ref of refs) {
			const resolved = byRef.get(ref);
			if (!resolved) {
				dangling.push({ featureDirectory: node, ref });
				continue;
			}
			const target = featureNodeId(resolved);
			// A self-edge is noise, not a cycle: it can never gate anything but would strand the
			// node in the topological walk and get reported as an unplaceable cycle member.
			if (target !== node) targets.add(target);
		}
		requires.set(node, [...targets].sort());
	}
	dangling.sort(
		(a, b) =>
			a.featureDirectory.localeCompare(b.featureDirectory) || a.ref.localeCompare(b.ref),
	);
	return { dangling, requires };
}

const DATED_NOTE = /(?<![\d-])\d{4}-\d{2}-\d{2}(?![\d-])/;
const ID_CHARACTER = /[\w-]/;

/**
 * Whether a completed feature explains its edge to `dependency` in a dated note: one note that holds
 * a `YYYY-MM-DD` date anywhere (`2026-11-04: …`, `[2026-11-04] …`, `Roadmap convention (2026-11-04):
 * …`) and names the dependency by directory or by id. The note must be on the feature itself; a
 * template-owned feature in a derived app gets its note through the template.
 */
function notesExplainEdge(feature: Feature, dependency: Feature | undefined): boolean {
	if (!dependency) return false;
	const names = [dependency.directory, dependency.id].filter(
		(name): name is string => typeof name === 'string' && name.length > 0,
	);
	const notes: unknown[] = Array.isArray(feature.notes) ? feature.notes : [feature.notes];
	return notes.some(
		(note) =>
			typeof note === 'string' &&
			DATED_NOTE.test(note) &&
			names.some((name) => namesToken(note, name)),
	);
}

/** `name` appears in `text` as a whole id, not inside a longer one (`late` is not in `latest`). */
function namesToken(text: string, name: string): boolean {
	for (let at = text.indexOf(name); at !== -1; at = text.indexOf(name, at + 1)) {
		const before = text[at - 1] ?? ' ';
		const after = text[at + name.length] ?? ' ';
		if (!ID_CHARACTER.test(before) && !ID_CHARACTER.test(after)) return true;
	}
	return false;
}

/** A completed feature whose own dated note explains its edge to a later-milestone dependency. */
function explainedLaterEdge(
	byNode: Map<string, Feature>,
	node: string,
	dependency: string,
): boolean {
	const own = byNode.get(node);
	return (
		own !== undefined && isFeatureComplete(own) && notesExplainEdge(own, byNode.get(dependency))
	);
}

/**
 * Features scheduled earlier than something they depend on. Nothing else in the pipeline reports
 * this: `evaluateRoadmapCodingGate` checks only that mappings exist and resolve, never that the
 * ordering they imply is satisfiable.
 *
 * A completed feature keeps the milestone it shipped in (Phillip #34088), so its edge to later work
 * is allowed when the record explains it in a dated note naming the dependency, and reported, as
 * passing, when it does not. An unfinished feature in that position is always reported.
 */
export function findCrossMilestoneViolations(
	roadmap: Roadmap,
	features: Feature[],
): CrossMilestoneViolation[] {
	const ranks = milestoneRanks(roadmap);
	const placed = (node: string): { milestone: string; rank: number } | undefined => {
		const milestone = roadmap.features[node]?.milestone;
		const rank = milestone === undefined ? undefined : ranks.get(milestone);
		return milestone === undefined || rank === undefined ? undefined : { milestone, rank };
	};
	const { requires } = dependencyEdges(roadmap, features);
	const byNode = new Map(features.map((feature) => [featureNodeId(feature), feature]));
	const violations: CrossMilestoneViolation[] = [];
	for (const [node, deps] of requires) {
		const own = placed(node);
		if (own === undefined) continue;
		for (const dependency of deps) {
			const later = placed(dependency);
			if (later === undefined || later.rank <= own.rank) continue;
			if (explainedLaterEdge(byNode, node, dependency)) continue;
			violations.push({
				dependency,
				dependencyMilestone: later.milestone,
				featureDirectory: node,
				featurePasses: byNode.get(node)?.passes === true,
				milestone: own.milestone,
			});
		}
	}
	return violations.sort(
		(a, b) =>
			a.featureDirectory.localeCompare(b.featureDirectory) ||
			a.dependency.localeCompare(b.dependency),
	);
}

/**
 * Dependencies-first topological order. Nodes left unreturned are in — or downstream of — a
 * dependency cycle: no ordering exists for them, so placement leaves them where they are rather than
 * guessing. Kahn rather than the DFS in features/graph.ts because the unorderable set falls out of it
 * directly, and that set (not the cycle path) is what placement has to skip.
 */
export function topologicalOrder(requires: Map<string, string[]>): string[] {
	const dependents = new Map<string, string[]>();
	const remaining = new Map<string, number>();
	for (const [node, deps] of requires) {
		remaining.set(node, deps.length);
		for (const dep of deps) {
			const list = dependents.get(dep);
			if (list) list.push(node);
			else dependents.set(dep, [node]);
		}
	}
	const queue = [...requires.keys()].filter((node) => remaining.get(node) === 0).sort();
	const order: string[] = [];
	while (queue.length > 0) {
		const node = queue.shift() as string;
		order.push(node);
		for (const dependent of dependents.get(node) ?? []) {
			const left = (remaining.get(dependent) ?? 0) - 1;
			remaining.set(dependent, left);
			if (left === 0) queue.push(dependent);
		}
	}
	return order;
}

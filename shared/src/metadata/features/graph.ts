import { z } from 'zod/v4';

import { indexFeaturesByRef } from './indexByRef.ts';
import { type Feature } from './types.ts';

// A dependency edge resolved against the feature inventory. `ref` is the raw string as written in
// the source feature's `dependencies` array; `id` is the canonical node name (directory ?? id) it
// resolved to. They differ whenever a feature's directory and id disagree — the spernakit-derived
// case — which is exactly when a hand-written dependency list goes stale unnoticed.
export const featureGraphNodeSchema = z.object({
	id: z.string(),
	passes: z.boolean(),
	ref: z.string(),
	resolved: z.boolean(),
	status: z.string().optional(),
	title: z.string().optional(),
});

export type FeatureGraphNode = z.infer<typeof featureGraphNodeSchema>;

export const featureNeighborhoodSchema = z.object({
	/** Typed edge: the audit whose finding this feature remediates, when it is an audit finding. */
	auditSource: z.string().optional(),
	/** Node names from `requires` that are not yet passing. Non-empty means the runtime gate would
	 * not have selected this feature, so it signals stale metadata rather than normal work. */
	blockedBy: z.array(z.string()),
	id: z.string(),
	/** Reverse edges: features declaring a dependency ON this one. The collateral-impact list. */
	requiredBy: z.array(featureGraphNodeSchema),
	/** Forward edges: this feature's own `dependencies`, resolved. An entry with `resolved: false`
	 * matched no feature on disk — a dangling edge, i.e. a real metadata defect. */
	requires: z.array(featureGraphNodeSchema),
	status: z.string().optional(),
	title: z.string().optional(),
});

export type FeatureNeighborhood = z.infer<typeof featureNeighborhoodSchema>;

/** Canonical node name for a feature. Selection, the roadmap gate, and the on-disk directory all
 * key off this, so the graph must agree with them or the agent sees names it cannot look up. */
export function featureNodeId(feature: Feature): string {
	return feature.directory ?? feature.id;
}

export interface DanglingFeatureDependency {
	/** Canonical node name of the feature whose `dependencies` array holds the bad ref. */
	id: string;
	ref: string;
}

/**
 * Dependency refs matching no feature on disk. Such a ref can never be satisfied — the pass-state
 * lookup misses forever — so the declaring feature is permanently unselectable. That is a hard
 * defect, not untidiness: nothing else in the pipeline reports it, and the symptom is a backlog
 * that silently stops yielding work.
 */
export function findDanglingDependencies(allFeatures: Feature[]): DanglingFeatureDependency[] {
	const byRef = indexFeaturesByRef(allFeatures);
	const dangling: DanglingFeatureDependency[] = [];
	for (const feature of allFeatures) {
		for (const ref of feature.dependencies ?? []) {
			if (byRef.has(ref)) continue;
			dangling.push({ id: featureNodeId(feature), ref });
		}
	}
	return dangling.sort((a, b) => a.id.localeCompare(b.id) || a.ref.localeCompare(b.ref));
}

/**
 * Dependency cycles, each returned as a closed walk of canonical node names (first === last).
 *
 * A cycle makes every feature on it permanently unselectable: each waits on a predecessor that
 * transitively waits on it. The runtime gate cannot distinguish that from ordinary
 * not-yet-implemented work, so the run reports "all candidates dependency-blocked" and stops with
 * no cause named. Iterative DFS with an explicit stack — a recursive walk would risk overflow on a
 * large inventory, and this runs inside `--check-features` where a crash reads as a tooling bug.
 */
export function findDependencyCycles(allFeatures: Feature[]): string[][] {
	const byRef = indexFeaturesByRef(allFeatures);
	const edges = new Map<string, string[]>();
	for (const feature of allFeatures) {
		const from = featureNodeId(feature);
		const targets: string[] = [];
		for (const ref of feature.dependencies ?? []) {
			const resolved = byRef.get(ref);
			if (resolved) targets.push(featureNodeId(resolved));
		}
		edges.set(from, targets.sort());
	}
	const cycles = new Map<string, string[]>();
	const visited = new Set<string>();
	const onStack = new Set<string>();
	const stack: string[] = [];

	// Frames carry their own child cursor so the walk can be resumed without recursion.
	const walk = (root: string): void => {
		const frames: { cursor: number; node: string }[] = [{ cursor: 0, node: root }];
		visited.add(root);
		stack.push(root);
		onStack.add(root);
		while (frames.length > 0) {
			const frame = frames[frames.length - 1]!;
			const targets = edges.get(frame.node) ?? [];
			if (frame.cursor >= targets.length) {
				frames.pop();
				onStack.delete(frame.node);
				stack.pop();
				continue;
			}
			const target = targets[frame.cursor++]!;
			if (onStack.has(target)) {
				const start = stack.indexOf(target);
				if (start !== -1) {
					const walked = [...stack.slice(start), target];
					const key = canonicalCycleKey(walked);
					if (!cycles.has(key)) cycles.set(key, walked);
				}
				continue;
			}
			if (visited.has(target)) continue;
			visited.add(target);
			stack.push(target);
			onStack.add(target);
			frames.push({ cursor: 0, node: target });
		}
	};

	for (const node of [...edges.keys()].sort()) {
		if (!visited.has(node)) walk(node);
	}
	return [...cycles.values()].sort((a, b) => a.join('>').localeCompare(b.join('>')));
}

export interface ClassifiedDependencyCycle {
	/**
	 * True when no member passes. Only then is the loop actually stuck: every node waits on a
	 * predecessor that transitively waits on it, so the runtime gate can never admit any of them. A
	 * single passing member is enough for the loop to drain — its dependent's in-cycle edge is
	 * already satisfied, that feature becomes selectable, and completing it frees the next one. The
	 * declared edges are still contradictory metadata either way, but only a deadlock stalls work.
	 */
	deadlocked: boolean;
	/** Closed walk: the entry node repeated at the end, as `findDependencyCycles` returns it. */
	path: string[];
}

// One definition of "is this cycle blocking", shared by the `--check-features` gate and the audit
// prompt. Two copies of this rule drifting apart is exactly how a healthy backlog ends up failing
// validation while the prompt tells the auditor something the runtime disagrees with.
export function classifyDependencyCycles(allFeatures: Feature[]): ClassifiedDependencyCycle[] {
	const byRef = indexFeaturesByRef(allFeatures);
	return findDependencyCycles(allFeatures).map((path) => ({
		deadlocked: path.slice(0, -1).every((node) => byRef.get(node)?.passes !== true),
		path,
	}));
}

// The same cycle is reachable from every node on it, so dedupe by rotation-invariant identity:
// rotate the open walk to start at its smallest member. Without this, an N-node cycle is reported
// N times with different entry points.
function canonicalCycleKey(closedWalk: string[]): string {
	const open = closedWalk.slice(0, -1);
	let smallest = 0;
	for (let index = 1; index < open.length; index++) {
		if (open[index]!.localeCompare(open[smallest]!) < 0) smallest = index;
	}
	return [...open.slice(smallest), ...open.slice(0, smallest)].join('>');
}

function toNode(ref: string, resolved: Feature | undefined): FeatureGraphNode {
	if (!resolved) return { id: ref, passes: false, ref, resolved: false };
	return {
		id: featureNodeId(resolved),
		passes: resolved.passes === true,
		ref,
		resolved: true,
		...(resolved.status ? { status: resolved.status } : {}),
		...(resolved.title ? { title: resolved.title } : {}),
	};
}

function referencesFeature(candidate: Feature, feature: Feature): string | undefined {
	const names = new Set([feature.id, ...(feature.directory ? [feature.directory] : [])]);
	return (candidate.dependencies ?? []).find((ref) => names.has(ref));
}

/**
 * Resolves the selected feature's immediate dependency neighborhood: what must land before it
 * (`requires`) and what declares a dependency on it (`requiredBy`).
 *
 * Direct edges only — no transitive closure. Transitive prerequisites are already guaranteed by the
 * runtime gate (a passing direct dependency implies its own dependencies passed), so walking deeper
 * would spend tokens restating what `passes: true` already proves.
 */
export function buildFeatureNeighborhood(
	feature: Feature,
	allFeatures: Feature[],
): FeatureNeighborhood {
	const byRef = indexFeaturesByRef(allFeatures);
	const requires = (feature.dependencies ?? []).map((ref) => toNode(ref, byRef.get(ref)));
	const selfId = featureNodeId(feature);
	const requiredBy: FeatureGraphNode[] = [];
	for (const candidate of allFeatures) {
		if (featureNodeId(candidate) === selfId) continue;
		const ref = referencesFeature(candidate, feature);
		if (ref === undefined) continue;
		requiredBy.push(toNode(featureNodeId(candidate), candidate));
	}
	requiredBy.sort((a, b) => a.id.localeCompare(b.id));
	return {
		blockedBy: requires.filter((node) => !node.passes).map((node) => node.id),
		id: selfId,
		requiredBy,
		requires,
		...(feature.auditSource ? { auditSource: feature.auditSource } : {}),
		...(feature.status ? { status: feature.status } : {}),
		...(feature.title ? { title: feature.title } : {}),
	};
}

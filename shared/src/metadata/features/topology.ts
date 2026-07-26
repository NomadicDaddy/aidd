import { z } from 'zod/v4';

import {
	classifyDependencyCycles,
	featureNodeId,
	findDanglingDependencies,
	indexFeaturesByRef,
} from './graph.ts';
import { type Feature } from './types.ts';

// Per-hub file cap. Audit prompts carry the whole inventory's topology, so an unbounded file list
// on a wide hub would crowd out the audit's real instructions. The omitted count travels with it so
// a truncated list can never read as complete.
const HUB_FILE_LIMIT = 10;
const DEFAULT_HUB_LIMIT = 12;

const featureDependencyHubSchema = z.object({
	affectedFiles: z.array(z.string()),
	dependentCount: z.number(),
	dependents: z.array(z.string()),
	id: z.string(),
	omittedFileCount: z.number(),
	passes: z.boolean(),
	status: z.string().optional(),
	title: z.string().optional(),
});

type FeatureDependencyHub = z.infer<typeof featureDependencyHubSchema>;

export const featureDependencyTopologySchema = z.object({
	// `deadlocked` travels with each loop rather than being left to the auditor to infer: severity
	// depends on it, and a member's pass state is not always visible in the rendered block.
	cycles: z.array(z.object({ deadlocked: z.boolean(), path: z.array(z.string()) })),
	dangling: z.array(z.object({ id: z.string(), ref: z.string() })),
	edgeCount: z.number(),
	featureCount: z.number(),
	hubs: z.array(featureDependencyHubSchema),
	omittedHubCount: z.number(),
});

export type FeatureDependencyTopology = z.infer<typeof featureDependencyTopologySchema>;

/**
 * Whole-inventory dependency topology, ranked by fan-in.
 *
 * Audits score severity, and fan-in is severity evidence the auditor otherwise has no way to obtain:
 * a defect in a file owned by a feature six others depend on has six times the blast radius of the
 * same defect in a leaf. The integrity lists ride along because an auditor is the one actor already
 * chartered to report defects it finds, and a cycle or dangling edge is a defect in the backlog
 * itself.
 *
 * Only features with at least one dependent appear in `hubs` — a leaf carries no blast-radius signal,
 * and listing every feature would spend the entire budget restating the inventory.
 */
export function buildDependencyTopology(
	allFeatures: Feature[],
	options: { hubLimit?: number } = {},
): FeatureDependencyTopology {
	const byRef = indexFeaturesByRef(allFeatures);
	const dependentsByNode = new Map<string, string[]>();
	let edgeCount = 0;
	for (const feature of allFeatures) {
		const from = featureNodeId(feature);
		for (const ref of feature.dependencies ?? []) {
			const resolved = byRef.get(ref);
			if (!resolved) continue;
			edgeCount++;
			const target = featureNodeId(resolved);
			const dependents = dependentsByNode.get(target) ?? [];
			dependents.push(from);
			dependentsByNode.set(target, dependents);
		}
	}

	const ranked = allFeatures
		.map((feature) => ({
			dependents: [...new Set(dependentsByNode.get(featureNodeId(feature)) ?? [])].sort(
				(a, b) => a.localeCompare(b),
			),
			feature,
		}))
		.filter((entry) => entry.dependents.length > 0)
		.sort(
			(a, b) =>
				b.dependents.length - a.dependents.length ||
				featureNodeId(a.feature).localeCompare(featureNodeId(b.feature)),
		);

	const hubLimit = options.hubLimit ?? DEFAULT_HUB_LIMIT;
	return {
		cycles: classifyDependencyCycles(allFeatures),
		dangling: findDanglingDependencies(allFeatures),
		edgeCount,
		featureCount: allFeatures.length,
		hubs: ranked.slice(0, hubLimit).map((entry) => toHub(entry.feature, entry.dependents)),
		omittedHubCount: Math.max(0, ranked.length - hubLimit),
	};
}

function toHub(feature: Feature, dependents: string[]): FeatureDependencyHub {
	const files = (Array.isArray(feature.affectedFiles) ? feature.affectedFiles : [])
		.filter((file): file is string => typeof file === 'string' && file.trim().length > 0)
		.map((file) => file.trim());
	return {
		affectedFiles: files.slice(0, HUB_FILE_LIMIT),
		dependentCount: dependents.length,
		dependents,
		id: featureNodeId(feature),
		omittedFileCount: Math.max(0, files.length - HUB_FILE_LIMIT),
		passes: feature.passes === true,
		...(feature.status ? { status: feature.status } : {}),
		...(feature.title ? { title: feature.title } : {}),
	};
}

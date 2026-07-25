import { z } from 'zod/v4';

import type { Feature } from './features.ts';

export const roadmapMilestoneSchema = z
	.object({
		description: z.string().optional(),
		priority: z.number().optional(),
	})
	.passthrough();

export const roadmapFeatureEntrySchema = z
	.object({
		dependencies: z.array(z.string()).optional(),
		milestone: z.string().optional(),
	})
	.passthrough();

export const roadmapSchema = z
	.object({
		features: z.record(z.string(), roadmapFeatureEntrySchema).default({}),
		lifecycle: z.enum(['active', 'lts', 'locked']).optional(),
		milestones: z.record(z.string(), roadmapMilestoneSchema).default({}),
	})
	.passthrough();

export type Roadmap = z.infer<typeof roadmapSchema>;
export type RoadmapMilestone = z.infer<typeof roadmapMilestoneSchema>;

// roadmap.json is committed in the project's prettier-canonical form (useTabs, tabWidth 4,
// printWidth 100, jsonRecursiveSort). A plain JSON.stringify(_, null, 2) diverges from that
// on every line (2-space indent, unsorted keys, always-multiline arrays), so each routine
// single-feature write rewrote the entire file and fought the formatter. serializeRoadmap
// reproduces prettier's JSON printer instead: objects always break one sorted key per line,
// and arrays stay inline until they would exceed printWidth at their indentation. That keeps
// routine writes to a single-feature diff and leaves `prettier --write` with nothing to change.
const ROADMAP_PRINT_WIDTH = 100;
const ROADMAP_TAB_WIDTH = 4;

export function serializeRoadmap(roadmap: Roadmap): string {
	return `${printRoadmapValue(roadmap, 0, 0)}\n`;
}

function printRoadmapValue(value: unknown, depth: number, column: number): string {
	if (Array.isArray(value)) return printRoadmapArray(value, depth, column);
	if (value !== null && typeof value === 'object') {
		return printRoadmapObject(value as Record<string, unknown>, depth);
	}
	return JSON.stringify(value);
}

function printRoadmapObject(object: Record<string, unknown>, depth: number): string {
	const keys = Object.keys(object).sort();
	if (keys.length === 0) return '{}';
	const childIndent = '\t'.repeat(depth + 1);
	const childColumns = (depth + 1) * ROADMAP_TAB_WIDTH;
	const lines = keys.map((key) => {
		const keyText = JSON.stringify(key);
		const valueColumn = childColumns + keyText.length + 2;
		return `${childIndent}${keyText}: ${printRoadmapValue(object[key], depth + 1, valueColumn)}`;
	});
	return `{\n${lines.join(',\n')}\n${'\t'.repeat(depth)}}`;
}

function printRoadmapArray(array: unknown[], depth: number, column: number): string {
	if (array.length === 0) return '[]';
	const elements = array.map((item) => printRoadmapValue(item, depth + 1, 0));
	const inline = `[${elements.join(', ')}]`;
	if (!inline.includes('\n') && column + inline.length <= ROADMAP_PRINT_WIDTH) return inline;
	const childIndent = '\t'.repeat(depth + 1);
	const lines = array.map(
		(item) =>
			`${childIndent}${printRoadmapValue(item, depth + 1, (depth + 1) * ROADMAP_TAB_WIDTH)}`,
	);
	return `[\n${lines.join(',\n')}\n${'\t'.repeat(depth)}]`;
}

export type RoadmapCodingGateBlockReason = 'invalid_milestone_mapping' | 'unmapped_features';

export interface RoadmapCodingGate {
	activeMilestone: null | string;
	allowedFeatureDirectories: string[];
	blocked: boolean;
	blockReason: null | RoadmapCodingGateBlockReason;
	invalidMappings: { featureDirectory: string; milestone: string }[];
	milestones: string[];
	staleRoadmapFeatureDirectories: string[];
	unmappedFeatureDirectories: string[];
}

export interface MilestoneResolution {
	availableMilestones: { description?: string; name: string }[];
	description?: string;
	featureDirectories: string[];
	milestone: string;
}

export class UnknownMilestoneError extends Error {
	readonly milestone: string;
	readonly available: { description?: string; name: string }[];

	constructor(milestone: string, available: { description?: string; name: string }[]) {
		super(`Unknown milestone: '${milestone}'`);
		this.milestone = milestone;
		this.available = available;
	}
}

export function resolveMilestone(roadmap: Roadmap, milestone: string): MilestoneResolution {
	const available = Object.entries(roadmap.milestones).map(([name, entry]) => ({
		name,
		...(entry.description !== undefined ? { description: entry.description } : {}),
	}));
	const entry = roadmap.milestones[milestone];
	if (!entry) throw new UnknownMilestoneError(milestone, available);
	const featureDirectories = Object.entries(roadmap.features)
		.filter(([, value]) => value.milestone === milestone)
		.map(([dir]) => dir);
	return {
		milestone,
		...(entry.description !== undefined ? { description: entry.description } : {}),
		availableMilestones: available,
		featureDirectories,
	};
}

export function evaluateRoadmapCodingGate(
	roadmap: Roadmap,
	features: Feature[],
): RoadmapCodingGate {
	const milestones = orderedMilestoneNames(roadmap);
	const milestoneSet = new Set(milestones);
	const featureDirectories = features.map((feature) => feature.directory ?? feature.id);
	const featureDirectorySet = new Set(featureDirectories);
	const unmappedFeatureDirectories: string[] = [];
	const invalidMappings: { featureDirectory: string; milestone: string }[] = [];

	for (const featureDirectory of featureDirectories) {
		const milestone = roadmap.features[featureDirectory]?.milestone;
		if (!milestone) {
			unmappedFeatureDirectories.push(featureDirectory);
			continue;
		}
		if (!milestoneSet.has(milestone)) {
			invalidMappings.push({ featureDirectory, milestone });
		}
	}

	const staleRoadmapFeatureDirectories = Object.keys(roadmap.features).filter(
		(featureDirectory) => !featureDirectorySet.has(featureDirectory),
	);
	const blockReason =
		unmappedFeatureDirectories.length > 0
			? 'unmapped_features'
			: invalidMappings.length > 0
				? 'invalid_milestone_mapping'
				: null;
	const activeMilestone =
		blockReason === null ? firstIncompleteMilestone(roadmap, milestones, features) : null;
	const allowedFeatureDirectories =
		activeMilestone === null
			? []
			: featureDirectories.filter(
					(featureDirectory) =>
						roadmap.features[featureDirectory]?.milestone === activeMilestone,
				);

	return {
		activeMilestone,
		allowedFeatureDirectories,
		blocked: blockReason !== null,
		blockReason,
		invalidMappings,
		milestones,
		staleRoadmapFeatureDirectories,
		unmappedFeatureDirectories,
	};
}

function firstIncompleteMilestone(
	roadmap: Roadmap,
	milestones: string[],
	features: Feature[],
): null | string {
	for (const milestone of milestones) {
		const milestoneFeatures = features.filter(
			(feature) => roadmap.features[feature.directory ?? feature.id]?.milestone === milestone,
		);
		if (milestoneFeatures.some((feature) => feature.passes !== true)) return milestone;
	}
	return null;
}

const AUTO_MILESTONE_DESCRIPTION = 'Next-version backlog (auto-created)';

export interface AssignmentMilestoneSelection {
	createdMilestone?: RoadmapMilestone;
	milestone: string;
}

export function computeNextMilestoneName(milestones: string[]): string {
	let maxMajor: null | number = null;
	for (const name of milestones) {
		const match = /^v(\d+)\.(\d+)$/.exec(name);
		if (!match) continue;
		const major = Number(match[1]);
		if (maxMajor === null || major > maxMajor) maxMajor = major;
	}
	return maxMajor === null ? 'v1.0' : `v${maxMajor + 1}.0`;
}

export function orderedMilestoneNames(roadmap: Roadmap): string[] {
	return Object.entries(roadmap.milestones)
		.map(([name, entry], index) => ({ index, name, priority: entry.priority }))
		.sort((a, b) => {
			const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
			const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
			return pa === pb ? a.index - b.index : pa - pb;
		})
		.map((entry) => entry.name);
}

// Decides which milestone an unmapped/invalid feature should be assigned to. When the
// roadmap is active, new features land in the future backlog milestone (the last one by
// priority) and a next-version (vX+1) milestone is auto-created when work has reached the
// final defined milestone and no separate future bucket exists. Audit findings and remediations
// are current-version work, so they stay in the active (or last) existing milestone. LTS/locked
// roadmaps never gain new milestones; features fall back to the active or last existing milestone.
export function selectAssignmentMilestone(
	roadmap: Roadmap,
	features: Feature[],
	featureDirectory?: string,
): AssignmentMilestoneSelection {
	const ordered = orderedMilestoneNames(roadmap);
	const lifecycle = roadmap.lifecycle ?? 'active';

	if (ordered.length === 0) {
		return {
			createdMilestone: { description: AUTO_MILESTONE_DESCRIPTION, priority: 1 },
			milestone: 'v1.0',
		};
	}

	const active = firstIncompleteMilestone(roadmap, ordered, features);
	const lastName = ordered[ordered.length - 1] as string;
	const isAuditFinding = featureDirectory?.startsWith('audit-') === true;
	const isRemediation = featureDirectory?.startsWith('remediation-') === true;

	if (lifecycle !== 'active' || isAuditFinding || isRemediation) {
		return { milestone: active ?? lastName };
	}

	const lastIsEmpty = !features.some(
		(feature) => roadmap.features[feature.directory ?? feature.id]?.milestone === lastName,
	);
	const lastBeyondActive = active !== null && ordered.indexOf(lastName) > ordered.indexOf(active);
	if (lastIsEmpty || lastBeyondActive) {
		return { milestone: lastName };
	}

	const nextName = computeNextMilestoneName(ordered);
	if (roadmap.milestones[nextName]) {
		return { milestone: nextName };
	}
	const maxPriority = Math.max(
		0,
		...Object.values(roadmap.milestones).map((entry) => entry.priority ?? 0),
	);
	return {
		createdMilestone: { description: AUTO_MILESTONE_DESCRIPTION, priority: maxPriority + 1 },
		milestone: nextName,
	};
}

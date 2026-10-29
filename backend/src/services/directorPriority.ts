import type { AuditFreshnessContext } from 'aidd-shared/metadata/audit-freshness';
import type { Feature } from 'aidd-shared/metadata/features';

import {
	evaluateRoadmapCodingGate,
	isMissingRoadmap,
	type Roadmap,
} from 'aidd-shared/metadata/roadmap';
import { FileAiddStore } from 'aidd-shared/metadata/store';

import type { ProjectSummaryDto } from '../types.ts';
import type {
	DirectorPrioritizedWork,
	DirectorPriorityHealth,
	DirectorProjectPrioritySummary,
	DirectorRoadmapEligibility,
} from './director/priority/types.ts';
export {
	type DirectorAuditHealth,
	type DirectorBacklogBreakdown,
	type DirectorPrioritizedWork,
	type DirectorPriorityHealth,
	directorPriorityOrder,
	type DirectorProjectPrioritySummary,
} from './director/priority/types.ts';
import { checkAuditHealth } from './director/priority/auditHealth.ts';
import { summarizeBacklog } from './director/priority/backlogSummary.ts';
import { buildPriorityHealth, sortPrioritizedWork } from './director/priority/priorityHealth.ts';
import {
	buildBlockedBacklogHealthWork,
	buildProjectWork,
	expandTargetedWork,
} from './director/priority/workBuilder.ts';
export { expandTargetedWork, sortPrioritizedWork };
export async function buildDirectorProjectPriority(
	project: ProjectSummaryDto,
	options: {
		auditFreshnessContext?: AuditFreshnessContext;
		auditsEnabled?: boolean;
		catalogDir: string;
		features?: Feature[];
		// A roadmap the caller has already read, so the gate and the caller see the same file.
		roadmap?: Roadmap;
	},
): Promise<DirectorProjectPrioritySummary> {
	const [features, auditHealth] = await Promise.all([
		options.features !== undefined
			? Promise.resolve(options.features)
			: new FileAiddStore(project.path).listFeatures({ includeAudit: true }),
		checkAuditHealth(options.catalogDir, project.path, project.metadata.artifactCheck, {
			...(options.auditFreshnessContext
				? { auditFreshnessContext: options.auditFreshnessContext }
				: {}),
		}),
	]);
	const backlog = summarizeBacklog(
		features,
		project.isSpernakitTemplate === true,
		await roadmapEligibility(project.path, features, options.roadmap),
	);
	const auditsEnabled = options.auditsEnabled ?? true;
	const work = buildProjectWork(project, backlog, auditHealth, auditsEnabled);
	const priorityHealth = buildPriorityHealth([
		...work,
		...buildBlockedBacklogHealthWork(project, backlog, auditsEnabled),
	]);
	return { auditHealth, backlog, priorityHealth, work };
}

// What coding's roadmap gate would let a run take now. A project with no roadmap holds nothing
// back: coding creates one with every record in v1.0. A roadmap that cannot be read, or whose
// gate is blocked, stops coding outright, so nothing runs and the block is named.
async function roadmapEligibility(
	projectPath: string,
	features: Feature[],
	known: Roadmap | undefined,
): Promise<DirectorRoadmapEligibility> {
	let roadmap: Roadmap;
	try {
		roadmap = known ?? (await new FileAiddStore(projectPath).readRoadmap());
	} catch (err) {
		if (isMissingRoadmap(err)) return { block: null, runnable: null };
		return { block: 'invalid_roadmap', runnable: new Set() };
	}
	const gate = evaluateRoadmapCodingGate(roadmap, features);
	return {
		block: gate.blockReason,
		runnable: new Set(gate.blocked ? [] : gate.allowedFeatureDirectories),
	};
}

export function applyDirectorAuditPolicy(
	project: ProjectSummaryDto,
	summary: DirectorProjectPrioritySummary,
	auditsEnabled: boolean,
): DirectorProjectPrioritySummary {
	const work = buildProjectWork(project, summary.backlog, summary.auditHealth, auditsEnabled);
	const priorityHealth = buildPriorityHealth([
		...work,
		...buildBlockedBacklogHealthWork(project, summary.backlog, auditsEnabled),
	]);
	return { ...summary, priorityHealth, work };
}

export function buildFleetPriorityHealth(
	projects: { priorityHealth: DirectorPriorityHealth }[],
): DirectorPriorityHealth {
	const workLike: DirectorPrioritizedWork[] = [];
	for (const [index, project] of projects.entries()) {
		const taskType = project.priorityHealth.primaryTaskType;
		if (!taskType) continue;
		workLike.push({
			evidence: {},
			projectId: String(index),
			rank: index,
			reason: project.priorityHealth.reasons.join(' '),
			riskLevel: 'LOW',
			suggestedArgs: null,
			suggestedRecipe: null,
			taskType,
			title: project.priorityHealth.band,
		});
	}
	const health = buildPriorityHealth(workLike);
	if (health.primaryTaskType === null) return health;
	const scoresInPrimaryBucket = projects
		.map((project) => project.priorityHealth)
		.filter((healthItem) => healthItem.primaryTaskType === health.primaryTaskType)
		.map((healthItem) => healthItem.score);
	return {
		...health,
		reasons: projects.flatMap((project) => project.priorityHealth.reasons).slice(0, 8),
		score: Math.min(...scoresInPrimaryBucket),
	};
}

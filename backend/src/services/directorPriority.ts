import type { AuditFreshnessContext } from 'aidd-shared/metadata/audit-freshness';
import type { Feature } from 'aidd-shared/metadata/features';

import { evaluateRoadmapCodingGate, isMissingRoadmap } from 'aidd-shared/metadata/roadmap';
import { FileAiddStore } from 'aidd-shared/metadata/store';

import type { ProjectSummaryDto } from '../types.ts';
import type {
	DirectorPrioritizedWork,
	DirectorPriorityHealth,
	DirectorProjectPrioritySummary,
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
		await roadmapRunnableDirectories(project.path, features),
	);
	const auditsEnabled = options.auditsEnabled ?? true;
	const work = buildProjectWork(project, backlog, auditHealth, auditsEnabled);
	const priorityHealth = buildPriorityHealth([
		...work,
		...buildBlockedBacklogHealthWork(project, backlog, auditsEnabled),
	]);
	return { auditHealth, backlog, priorityHealth, work };
}

// The record directories coding's roadmap gate would let a run take now. A project with no
// roadmap returns null: coding creates one with every record in v1.0 and holds nothing back. A
// roadmap that cannot be read, or whose gate is blocked, stops coding outright, so nothing runs.
async function roadmapRunnableDirectories(
	projectPath: string,
	features: Feature[],
): Promise<null | ReadonlySet<string>> {
	try {
		const roadmap = await new FileAiddStore(projectPath).readRoadmap();
		const gate = evaluateRoadmapCodingGate(roadmap, features);
		return new Set(gate.blocked ? [] : gate.allowedFeatureDirectories);
	} catch (err) {
		if (isMissingRoadmap(err)) return null;
		return new Set();
	}
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

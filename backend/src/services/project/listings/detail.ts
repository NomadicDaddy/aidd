import type { Roadmap } from 'aidd-shared/metadata/roadmap';

import { createAuditFreshnessContext } from 'aidd-shared/metadata/audit-freshness';
import { summarizeFeatures } from 'aidd-shared/metadata/features';
import { detectInitialPhase } from 'aidd-shared/metadata/onboarding';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { basename, resolve } from 'node:path';

import type {
	ProjectArtifactCheckSummary,
	ProjectDetailDto,
	ProjectSummaryDto,
} from '../../../types.ts';

import { buildProjectRouteIds, encodeProjectId } from '../../../paths.ts';
import { buildDirectorProjectPriority } from '../../directorPriority.ts';
import { gatherProjectMetadata } from '../../projectMetadata.ts';
import { evaluatePersistedProjectImplementationState } from '../implementation.ts';
import {
	toWebFeatureStats,
	toWebFeatureStatusEntries,
	toWebFeatureSummary,
	withRoadmapMilestones,
} from './featureMappers.ts';
import {
	discoverProjects,
	healthyPriorityHealth,
	type ListingsContext,
	resolveContainingRoot,
} from './shared.ts';

export async function getProjectDetail(
	ctx: ListingsContext,
	projectId: string,
): Promise<ProjectDetailDto> {
	const projectDir = await ctx.resolveDiscoveredProject(projectId);
	const store = new FileAiddStore(projectDir);
	const [discovery, features, phase] = await Promise.all([
		discoverProjects(ctx),
		store.listFeatures({ includeAudit: true }),
		detectInitialPhase(projectDir),
	]);
	const routeId =
		buildProjectRouteIds(discovery.projects.map((project) => project.path)).get(
			resolve(projectDir),
		) ?? basename(projectDir);
	const featureSummary = toWebFeatureSummary(features);
	const featureStatus = toWebFeatureStatusEntries(features);
	const featureStats = toWebFeatureStats(summarizeFeatures(features));
	const auditFreshnessContext = createAuditFreshnessContext();
	const containingRoot = resolveContainingRoot(ctx.config.allowedRoots, projectDir);

	// Run a fresh artifact check before gatherProjectMetadata so the maturity
	// computation uses the same up-to-date artifact state as the rest of the
	// response. Without this, maturity could use a stale .artifacts-check.json
	// (e.g. missing roadmap.json) while metadata.roadmap reads roadmap.json fresh
	// from disk, producing contradictory "roadmap exists" / "roadmap missing" views.
	let freshArtifactCheck: ProjectArtifactCheckSummary | undefined;
	let rawArtifactCheck: unknown;
	let artifactHealth: ProjectSummaryDto['artifactHealth'] = 'unknown';
	try {
		const result = await store.checkArtifacts();
		rawArtifactCheck = result;
		freshArtifactCheck = {
			artifacts: result.artifacts,
			checkedAt: result.checkedAt,
			staleThresholdDays: result.staleThresholdDays,
			summary: result.summary,
		};
		artifactHealth =
			result.summary.requiredMissing > 0
				? 'missing'
				: result.summary.stale > 0
					? 'stale'
					: 'fresh';
	} catch {
		rawArtifactCheck = undefined;
	}

	const metadata = await gatherProjectMetadata(projectDir, store, {
		auditFreshnessContext,
		features,
		featureStats,
		stackOptions: {
			containingRoot,
			spernakitFleetManifest: ctx.config.spernakitFleetManifest,
		},
		...(ctx.maturityContext ? { maturityContext: ctx.maturityContext } : {}),
		...(freshArtifactCheck !== undefined ? { artifactCheck: freshArtifactCheck } : {}),
	});
	let roadmap: Roadmap | undefined;
	try {
		roadmap = await store.readRoadmap();
	} catch {
		roadmap = undefined;
	}
	const metadataArtifactCheck = freshArtifactCheck ?? metadata.artifactCheck;
	const { maturityDetail, ...metadataRest } = metadata;
	const implementation = await evaluatePersistedProjectImplementationState(
		projectDir,
		phase,
		features,
		roadmap,
	);
	const summary: ProjectDetailDto = {
		activeRuns: { count: 0, latestRunId: null },
		artifactCheck: rawArtifactCheck,
		artifactHealth,
		features: withRoadmapMilestones(features, roadmap),
		featureStats,
		featureStatus,
		featureSummary,
		id: encodeProjectId(projectDir),
		implementation,
		maturityDetail: maturityDetail ?? {
			auditProfileBucket: null,
			auditProfileLabel: null,
			currentStageId: null,
			currentStageLabel: null,
			nextAction: null,
			nextArtifactLabel: null,
			nextArtifactSlug: null,
			percent: 0,
			skip: [],
			stages: [],
			stageStatuses: [],
		},
		metadata: { ...metadataRest, artifactCheck: metadataArtifactCheck, phase },
		name: basename(projectDir),
		path: projectDir,
		phase,
		priorityHealth: healthyPriorityHealth,
		root: containingRoot,
		routeId,
		...(roadmap !== undefined ? { roadmap } : {}),
	};
	summary.priorityHealth = (
		await buildDirectorProjectPriority(summary, {
			auditFreshnessContext,
			catalogDir: ctx.catalogDir ?? process.cwd(),
			features,
		})
	).priorityHealth;
	return summary;
}

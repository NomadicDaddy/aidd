import { defaultIgnoredFolders } from 'aidd-shared/config';
import { createAuditFreshnessContext } from 'aidd-shared/metadata/audit-freshness';
import { summarizeFeatures } from 'aidd-shared/metadata/features';
import { detectInitialPhase } from 'aidd-shared/metadata/onboarding';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { basename, join, resolve } from 'node:path';

import type {
	ProjectDiscoverySkippedRootDto,
	ProjectImportCandidateDto,
	ProjectImportCandidatesResponseDto,
	ProjectNamesResponseDto,
	ProjectsListResponseDto,
	ProjectSummaryDto,
} from '../../../types.ts';
import type { ProjectListingCacheValue } from '../metadataCache.ts';

import { buildProjectRouteIds, encodeProjectId } from '../../../paths.ts';
import { buildDirectorProjectPriority } from '../../directorPriority.ts';
import { gatherProjectMetadata } from '../../projectMetadata.ts';
import {
	createIgnoredDirectoryMatcher,
	dedupeSkippedRoots,
	fileExists,
	scanImportCandidates,
} from '../discovery.ts';
import { readSpernakitTemplateVersion } from '../spernakitCheckout.ts';
import {
	toWebFeatureStats,
	toWebFeatureStatusEntries,
	toWebFeatureSummary,
} from './featureMappers.ts';
import {
	discoverProjects,
	healthyPriorityHealth,
	type ListingsContext,
	mapSettledWithConcurrency,
	PROJECT_LISTING_COMPUTE_CONCURRENCY,
	type ProjectListingWithPriority,
} from './shared.ts';

export async function listProjectListings(ctx: ListingsContext): Promise<{
	projects: ProjectListingWithPriority[];
	skippedRoots: ProjectDiscoverySkippedRootDto[];
}> {
	const { projects: discoveredProjects, skippedRoots } = await discoverProjects(ctx);
	const routeIds = buildProjectRouteIds(discoveredProjects.map((project) => project.path));
	ctx.listingCache?.retainOnly(discoveredProjects.map((p) => p.path));
	const computeSummary = async (
		projectDir: string,
		root: string,
	): Promise<ProjectListingCacheValue> => {
		const store = new FileAiddStore(projectDir);
		const [features, phase, isSpernakitTemplate] = await Promise.all([
			store.listFeatures({ includeAudit: true }),
			detectInitialPhase(projectDir),
			// The spernakit template checkout (hidden from the projects page unless
			// web.showSpernakitProject is on) is identified by name + portable generator.
			basename(projectDir) === 'spernakit'
				? fileExists(join(projectDir, 'scripts', 'init.ts'))
				: Promise.resolve(false),
		]);
		const featureSummary = toWebFeatureSummary(features);
		const featureStatus = toWebFeatureStatusEntries(features);
		const featureStats = toWebFeatureStats(summarizeFeatures(features));
		const auditFreshnessContext = createAuditFreshnessContext();
		const metadata = await gatherProjectMetadata(projectDir, store, {
			auditFreshnessContext,
			features,
			featureStats,
			stackOptions: {
				containingRoot: root,
				spernakitFleetManifest: ctx.config.spernakitFleetManifest,
			},
			...(ctx.maturityContext ? { maturityContext: ctx.maturityContext } : {}),
		});
		const artifactHealth: ProjectSummaryDto['artifactHealth'] = metadata.artifactCheck
			? metadata.artifactCheck.summary.requiredMissing > 0
				? 'missing'
				: metadata.artifactCheck.summary.stale > 0
					? 'stale'
					: 'fresh'
			: 'unknown';
		const { maturityDetail: _maturityDetail, usage, ...metadataRest } = metadata;
		const summary: ProjectSummaryDto = {
			activeRuns: { count: 0, latestRunId: null },
			artifactHealth,
			featureStats,
			featureStatus,
			featureSummary,
			id: encodeProjectId(projectDir),
			...(isSpernakitTemplate ? { isSpernakitTemplate: true } : {}),
			metadata: {
				...metadataRest,
				phase,
				usage: {
					recentDailyTokens: usage.recentDailyTokens,
					totals: usage.totals,
				},
			},
			name: basename(projectDir),
			path: projectDir,
			phase,
			priorityHealth: healthyPriorityHealth,
			root,
			routeId: basename(projectDir),
		};
		const prioritySummary = await buildDirectorProjectPriority(summary, {
			auditFreshnessContext,
			catalogDir: ctx.catalogDir ?? process.cwd(),
			features,
		});
		summary.priorityHealth = prioritySummary.priorityHealth;
		return { prioritySummary, summary };
	};
	const results = await mapSettledWithConcurrency(
		discoveredProjects,
		PROJECT_LISTING_COMPUTE_CONCURRENCY,
		({ path: projectDir, root }): Promise<ProjectListingCacheValue> =>
			ctx.listingCache
				? ctx.listingCache.getOrCompute(
						projectDir,
						() => computeSummary(projectDir, root),
						{
							containingRoot: root,
							spernakitFleetManifest: ctx.config.spernakitFleetManifest,
						},
					)
				: computeSummary(projectDir, root),
	);
	const projects = results
		.filter(
			(r): r is PromiseFulfilledResult<ProjectListingCacheValue> => r.status === 'fulfilled',
		)
		.map((r) => {
			const value = r.value;
			return {
				...value,
				summary: {
					...value.summary,
					routeId: routeIds.get(resolve(value.summary.path)) ?? value.summary.routeId,
				},
			};
		});
	return { projects, skippedRoots };
}

export async function listProjects(ctx: ListingsContext): Promise<ProjectsListResponseDto> {
	const [{ projects, skippedRoots }, spernakitTemplateVersion] = await Promise.all([
		listProjectListings(ctx),
		readSpernakitTemplateVersion(ctx.config),
	]);
	// initFailures is populated by the ProjectService wrapper (which holds the db); the
	// scan-only internal listing leaves it empty.
	return {
		initFailures: [],
		projects: projects.map((project) => project.summary),
		skippedRoots,
		spernakitTemplateVersion,
	};
}

// Lightweight project list (id + name + path only) for callers that just need
// to enumerate projects — e.g. the report dialog's project picker. Skips the
// expensive per-project metadata compute so the report dialog does not block on a full scan when
// the filesystem cache is cold.
export async function listProjectNames(ctx: ListingsContext): Promise<ProjectNamesResponseDto> {
	const { projects, skippedRoots } = await discoverProjects(ctx);
	const routeIds = buildProjectRouteIds(projects.map((project) => project.path));
	// Same template detection the listing scan runs (name + portable generator), so the count
	// derived from this endpoint can hide the template exactly as the projects page does. Only
	// a directory actually named spernakit reaches the filesystem, so this stays one stat
	// call across the whole fleet rather than one per project.
	const templateFlags = await Promise.all(
		projects.map(({ path }) =>
			basename(path) === 'spernakit'
				? fileExists(join(path, 'scripts', 'init.ts'))
				: Promise.resolve(false),
		),
	);
	return {
		projects: projects.map(({ path }, index) => ({
			id: encodeProjectId(path),
			...(templateFlags[index] ? { isSpernakitTemplate: true } : {}),
			name: basename(path),
			path,
			routeId: routeIds.get(resolve(path)) ?? basename(path),
		})),
		skippedRoots,
	};
}

export async function listImportCandidates(
	ctx: ListingsContext,
): Promise<ProjectImportCandidatesResponseDto> {
	const isIgnoredDirectory = createIgnoredDirectoryMatcher(
		ctx.config.ignoredFolders.length > 0 ? ctx.config.ignoredFolders : defaultIgnoredFolders,
	);
	const existingProjects = await listProjects(ctx);
	const existingProjectPaths = new Set(existingProjects.projects.map((project) => project.path));
	const scans = await Promise.all(
		ctx.config.allowedRoots.map((root) =>
			scanImportCandidates(root, 2, isIgnoredDirectory, existingProjectPaths),
		),
	);
	const skippedRoots: ProjectDiscoverySkippedRootDto[] = [...existingProjects.skippedRoots];
	const candidates = new Map<string, ProjectImportCandidateDto>();
	for (const scan of scans) {
		if (scan.skipped) skippedRoots.push(scan.skipped);
		for (const candidate of scan.candidates) {
			const canonicalPath = resolve(candidate.path);
			candidates.set(canonicalPath, { ...candidate, path: canonicalPath });
		}
	}
	return {
		candidates: [...candidates.values()].sort((left, right) =>
			left.path.localeCompare(right.path),
		),
		skippedRoots: dedupeSkippedRoots(skippedRoots),
	};
}

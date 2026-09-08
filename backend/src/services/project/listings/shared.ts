import { defaultIgnoredFolders, type ResolvedWebConfig } from 'aidd-shared/config';
import { resolve } from 'node:path';

import type { ProjectDiscoverySkippedRootDto, ProjectSummaryDto } from '../../../types.ts';
import type { DirectorProjectPrioritySummary } from '../../directorPriority.ts';
import type { MaturityContext } from '../../projectMetadata.ts';
import type { ProjectListingCache } from '../metadataCache.ts';
import type { SetupActivityProvider } from '../setupActivity.ts';

import { pathIsInside } from '../../../paths.ts';
import { chooseProjectRoot, createIgnoredDirectoryMatcher, scanRoot } from '../discovery.ts';

// Per-project summary compute is I/O-bound (filesystem stats + feature.json parses +
// git-head reads), so it scales past CPU count. Raised 4 -> 8 after a cold /projects +
// /director/fleet load measured ~3.25s of server time at 4-wide across ~25 projects;
// 8-wide roughly halves the cold-scan wall time. The stale-while-revalidate cache
// (see ProjectListingCache) means this cost is paid only on the first load anyway.
export const PROJECT_LISTING_COMPUTE_CONCURRENCY = 8;

export const healthyPriorityHealth: ProjectSummaryDto['priorityHealth'] = {
	band: 'healthy',
	primaryBucket: 'healthy',
	primaryTaskType: null,
	reasons: ['No priority issues detected.'],
	score: 100,
};

export interface ListingsContext {
	catalogDir: null | string;
	config: ResolvedWebConfig;
	listingCache?: ProjectListingCache;
	maturityContext: MaturityContext | null;
	resolveDiscoveredProject(projectId: string): Promise<string>;
	/**
	 * Live run and pipeline state for one project, when the caller has been wired to the execution
	 * services. Absent in tests and in any context with no view of execution, which reads as "nothing
	 * is running" — the honest default, since claiming activity is the failure mode being fixed.
	 */
	setupActivityProvider?: SetupActivityProvider;
}

export interface ProjectListingWithPriority {
	prioritySummary: DirectorProjectPrioritySummary;
	summary: ProjectSummaryDto;
}

export function resolveContainingRoot(allowedRoots: string[], projectDir: string): string {
	const resolvedProjectDir = resolve(projectDir);
	const containingRoots = allowedRoots
		.map((root) => resolve(root))
		.filter((root) => pathIsInside(root, resolvedProjectDir));
	containingRoots.sort((left, right) => {
		const lengthDiff = right.length - left.length;
		return lengthDiff === 0 ? left.localeCompare(right) : lengthDiff;
	});
	return containingRoots[0] ?? resolve(allowedRoots[0] ?? projectDir);
}

export async function mapSettledWithConcurrency<TInput, TOutput>(
	items: TInput[],
	concurrency: number,
	mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<PromiseSettledResult<TOutput>[]> {
	if (items.length === 0) return [];
	const limit = Math.max(1, Math.floor(concurrency));
	const results: PromiseSettledResult<TOutput>[] = new Array(items.length);
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			const item = items[currentIndex] as TInput;
			try {
				results[currentIndex] = {
					status: 'fulfilled',
					value: await mapper(item, currentIndex),
				};
			} catch (err) {
				results[currentIndex] = { reason: err, status: 'rejected' };
			}
		}
	});
	await Promise.all(workers);
	return results;
}

// Discovery-only project enumeration: walks the configured roots for `.aidd`
// markers and dedupes by path. Deliberately does no per-project metadata
// compute (features, git, maturity, priority) — that heavy work lives in
// computeSummary. Shared by the full listing and the lightweight names list.
export async function discoverProjects(ctx: ListingsContext): Promise<{
	projects: { path: string; root: string }[];
	skippedRoots: ProjectDiscoverySkippedRootDto[];
}> {
	const isIgnoredDirectory = createIgnoredDirectoryMatcher(
		ctx.config.ignoredFolders.length > 0 ? ctx.config.ignoredFolders : defaultIgnoredFolders,
	);
	const scans = await Promise.all(
		ctx.config.allowedRoots.map((root) => scanRoot(root, 2, isIgnoredDirectory)),
	);
	const skippedRoots: ProjectDiscoverySkippedRootDto[] = [];
	const discovered = new Map<string, { path: string; root: string }>();
	for (const scan of scans) {
		if (scan.skipped) skippedRoots.push(scan.skipped);
		for (const project of scan.projects) {
			const canonicalPath = resolve(project.path);
			discovered.set(canonicalPath, {
				...chooseProjectRoot(discovered.get(canonicalPath), project),
				path: canonicalPath,
			});
		}
	}
	const projects = [...discovered.values()].sort((left, right) =>
		left.path.localeCompare(right.path),
	);
	return { projects, skippedRoots };
}

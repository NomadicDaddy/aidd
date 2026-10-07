import {
	type AuditApplicabilityRow,
	type AuditProfileMapping,
	isAuditApplicableToProject,
	type ProjectAssuranceBucket,
	projectAssuranceBuckets,
} from 'aidd-shared';
import {
	type AuditFreshnessContext,
	createAuditFreshnessContext,
	evaluateAuditReportFreshness,
} from 'aidd-shared/metadata/audit-freshness';
import { loadAuditProfileOverrides } from 'aidd-shared/metadata/audit-profile-mapping';
import {
	buildScoreInput,
	type ChangePotential,
	collectProjectEvidence,
	enumerateProjectsUnderRoots,
	loadAuditPriorities,
	scoreAudit,
} from 'aidd-shared/metadata/audit-scoring';
import { projectDependencyNames } from 'aidd-shared/metadata/project-packages';
import { readProjectAssuranceProfile } from 'aidd-shared/metadata/project-profile';
import { stat } from 'node:fs/promises';

import type { AuditDefinitionDto } from './auditTypes.ts';

import { HttpError } from '../errors.ts';
import { mapSettledWithConcurrency } from '../project/listings/shared.ts';

/**
 * Projects examined at once inside one audit's summary. The catalog already runs every audit in
 * parallel; inside each, projects were walked one await at a time, and the first audit to reach a
 * project paid its git probes while every other audit queued behind that same project. With 75
 * projects that serial walk was the floor of GET /api/v1/audits (about 4 s). Eight keeps the git
 * process count bounded while the walk no longer serialises on the slowest project.
 */
const PROJECT_CONCURRENCY = 8;

// Settled results with the first rejection rethrown: the catalog never reports partial counts.
async function forEachProject<TProject, TOut>(
	projects: readonly TProject[],
	mapper: (project: TProject) => Promise<TOut>,
): Promise<TOut[]> {
	const settled = await mapSettledWithConcurrency([...projects], PROJECT_CONCURRENCY, mapper);
	const out: TOut[] = [];
	for (const result of settled) {
		if (result.status === 'rejected') throw result.reason;
		out.push(result.value);
	}
	return out;
}

const auditNamePattern = /^[A-Z0-9_]+$/;

export function normalizeAuditName(name: string): string {
	const normalized = name.trim().toUpperCase();
	if (!auditNamePattern.test(normalized)) throw new HttpError('Invalid audit name.', 400);
	return normalized;
}

export function normalizeAuditNames(names: string[]): string[] {
	return [...new Set(names.map((name) => normalizeAuditName(name)))];
}

export interface ProjectProfileEntry {
	overrides: Awaited<ReturnType<typeof loadAuditProfileOverrides>>;
	packages: Set<string>;
	profile: Awaited<ReturnType<typeof readProjectAssuranceProfile>>;
}

// A project's assurance profile and audit overrides are constant across one audit-manager
// listing. Load each project's values lazily once and share them across every audit in the
// listAuditManager call, mirroring the freshnessContexts memoization in definitionSummary.
// The cache holds the pending load, not its result: every audit reaches every project at once,
// and a cache filled only on completion missed for all of them (1,240 loads for 54 projects).
export type ProjectProfileCache = Map<string, Promise<ProjectProfileEntry>>;

async function loadProfileEntry(projectPath: string): Promise<ProjectProfileEntry> {
	const [profile, overrides, packages] = await Promise.all([
		readProjectAssuranceProfile(projectPath),
		loadAuditProfileOverrides(projectPath),
		projectDependencyNames(projectPath),
	]);
	return { overrides, packages, profile };
}

function resolveProfileEntry(
	cache: ProjectProfileCache,
	projectPath: string,
): Promise<ProjectProfileEntry> {
	let entry = cache.get(projectPath);
	if (!entry) {
		entry = loadProfileEntry(projectPath);
		cache.set(projectPath, entry);
	}
	return entry;
}

export async function definitionSummary(
	name: string,
	projects: { name: string; path: string }[],
	mapping: AuditProfileMapping,
	matrixIndex: Map<string, AuditApplicabilityRow>,
	freshnessContexts: Map<string, AuditFreshnessContext>,
	profileCache: ProjectProfileCache,
	auditsEnabled: boolean,
	auditPathFn: (name: string) => string,
): Promise<AuditDefinitionDto> {
	const normalized = normalizeAuditName(name);
	const path = auditPathFn(normalized);
	const file = await stat(path).catch(() => null);
	const applicability = await computeApplicability(
		normalized,
		projects,
		mapping,
		matrixIndex,
		profileCache,
	);
	const reportHealth = await computeReportHealth(
		normalized,
		projects,
		mapping,
		freshnessContexts,
		profileCache,
	);
	return {
		...applicability,
		...reportHealth,
		enabled: auditsEnabled,
		name: normalized,
		path,
		updatedAt: file ? file.mtime.toISOString() : null,
	};
}

async function computeApplicability(
	name: string,
	projects: { name: string; path: string }[],
	mapping: AuditProfileMapping,
	matrixIndex: Map<string, AuditApplicabilityRow>,
	profileCache: ProjectProfileCache,
): Promise<{
	applicableBucketCount: number;
	applicableProjectCount: number;
	appliesToBucket: Record<ProjectAssuranceBucket, boolean>;
	excludedProjectCount: number;
}> {
	const matrixRow = matrixIndex.get(name.toUpperCase());
	const appliesToBucket = {} as Record<ProjectAssuranceBucket, boolean>;
	let applicableBucketCount = 0;
	for (const bucket of projectAssuranceBuckets) {
		const applies = matrixRow ? matrixRow.byBucket[bucket].applies : true;
		appliesToBucket[bucket] = applies;
		if (applies) applicableBucketCount++;
	}
	const applicable = await forEachProject(projects, async (project) => {
		const { overrides, packages, profile } = await resolveProfileEntry(
			profileCache,
			project.path,
		);
		return isAuditApplicableToProject(profile, packages, name, mapping, overrides);
	});
	const applicableProjectCount = applicable.filter(Boolean).length;
	return {
		applicableBucketCount,
		applicableProjectCount,
		appliesToBucket,
		excludedProjectCount: Math.max(0, projects.length - applicableProjectCount),
	};
}

async function computeReportHealth(
	name: string,
	projects: { path: string }[],
	mapping: AuditProfileMapping,
	freshnessContexts: Map<string, AuditFreshnessContext>,
	profileCache: ProjectProfileCache,
): Promise<{
	freshReportCount: number;
	missingReportCount: number;
	staleReportCount: number;
}> {
	let freshReportCount = 0;
	let missingReportCount = 0;
	let staleReportCount = 0;
	const statuses = await forEachProject(projects, async (project) => {
		// Equivalent to filterApplicableAuditNames(rootDir, project.path, [name]) but using
		// the shared profile/overrides cache and the already-loaded mapping instead of
		// re-reading all three from disk for every audit × project.
		const { overrides, packages, profile } = await resolveProfileEntry(
			profileCache,
			project.path,
		);
		if (!isAuditApplicableToProject(profile, packages, name, mapping, overrides)) return null;
		// The context map is shared by every audit of the listing; the lookup and the insert are
		// synchronous, so two audits reaching one project still share one context.
		let context = freshnessContexts.get(project.path);
		if (!context) {
			context = createAuditFreshnessContext();
			freshnessContexts.set(project.path, context);
		}
		const freshness = await evaluateAuditReportFreshness(project.path, name, { context });
		return freshness.status;
	});
	for (const status of statuses) {
		if (status === null) continue;
		if (status === 'missing') {
			missingReportCount++;
		} else if (status === 'stale') {
			staleReportCount++;
		} else {
			freshReportCount++;
		}
	}
	return { freshReportCount, missingReportCount, staleReportCount };
}

export async function scoreAuditCatalog(
	auditNames: readonly string[],
	rootDir: string,
	resolveScoringRoots: () => string[],
): Promise<Map<string, ChangePotential>> {
	const result = new Map<string, ChangePotential>();
	if (auditNames.length === 0) return result;
	const roots = resolveScoringRoots();
	const projectDirs = await enumerateProjectsUnderRoots(roots);
	const [priorities, projectEvidence] = await Promise.all([
		loadAuditPriorities(rootDir, auditNames),
		Promise.all(projectDirs.map((dir) => collectProjectEvidence(dir))),
	]);
	const context = { priorities, projects: projectEvidence };
	for (const name of auditNames) {
		const upper = name.toUpperCase();
		result.set(upper, scoreAudit(buildScoreInput(upper, context)));
	}
	return result;
}

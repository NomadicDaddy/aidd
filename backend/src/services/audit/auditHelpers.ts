import {
	isAuditApplicableToProfile,
	projectAssuranceBuckets,
	type AuditApplicabilityRow,
	type AuditProfileMapping,
	type ProjectAssuranceBucket,
} from 'aidd-shared';
import {
	createAuditFreshnessContext,
	evaluateAuditReportFreshness,
	type AuditFreshnessContext,
} from 'aidd-shared/metadata/audit-freshness';
import { loadAuditProfileOverrides } from 'aidd-shared/metadata/audit-profile-mapping';
import {
	buildScoreInput,
	collectProjectEvidence,
	enumerateProjectsUnderRoots,
	loadAuditPriorities,
	scoreAudit,
	type ChangePotential,
} from 'aidd-shared/metadata/audit-scoring';
import { readProjectAssuranceProfile } from 'aidd-shared/metadata/project-profile';
import { stat } from 'node:fs/promises';

import type { AuditDefinitionDto } from './auditTypes.ts';

const auditNamePattern = /^[A-Z0-9_]+$/;

export function normalizeAuditName(name: string): string {
	const normalized = name.trim().toUpperCase();
	if (!auditNamePattern.test(normalized)) throw new Error('Invalid audit name.');
	return normalized;
}

export function normalizeAuditNames(names: string[]): string[] {
	return [...new Set(names.map((name) => normalizeAuditName(name)))];
}

export interface ProjectProfileEntry {
	overrides: Awaited<ReturnType<typeof loadAuditProfileOverrides>>;
	profile: Awaited<ReturnType<typeof readProjectAssuranceProfile>>;
}

// A project's assurance profile and audit overrides are constant across one audit-manager
// listing. Load each project's values lazily once and share them across every audit in the
// listAuditManager call, mirroring the freshnessContexts memoization in definitionSummary.
export type ProjectProfileCache = Map<string, ProjectProfileEntry>;

async function resolveProfileEntry(
	cache: ProjectProfileCache,
	projectPath: string
): Promise<ProjectProfileEntry> {
	const cached = cache.get(projectPath);
	if (cached) return cached;
	const [profile, overrides] = await Promise.all([
		readProjectAssuranceProfile(projectPath),
		loadAuditProfileOverrides(projectPath),
	]);
	const entry: ProjectProfileEntry = { overrides, profile };
	cache.set(projectPath, entry);
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
	auditPathFn: (name: string) => string
): Promise<AuditDefinitionDto> {
	const normalized = normalizeAuditName(name);
	const path = auditPathFn(normalized);
	const file = await stat(path).catch(() => null);
	const applicability = await computeApplicability(
		normalized,
		projects,
		mapping,
		matrixIndex,
		profileCache
	);
	const reportHealth = await computeReportHealth(
		normalized,
		projects,
		mapping,
		freshnessContexts,
		profileCache
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
	profileCache: ProjectProfileCache
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
	let applicableProjectCount = 0;
	for (const project of projects) {
		const { overrides, profile } = await resolveProfileEntry(profileCache, project.path);
		if (isAuditApplicableToProfile(profile, name, mapping, overrides)) applicableProjectCount++;
	}
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
	profileCache: ProjectProfileCache
): Promise<{
	freshReportCount: number;
	missingReportCount: number;
	staleReportCount: number;
}> {
	let freshReportCount = 0;
	let missingReportCount = 0;
	let staleReportCount = 0;
	for (const project of projects) {
		// Equivalent to filterApplicableAuditNames(rootDir, project.path, [name]) but using
		// the shared profile/overrides cache and the already-loaded mapping instead of
		// re-reading all three from disk for every audit × project.
		const { overrides, profile } = await resolveProfileEntry(profileCache, project.path);
		if (!isAuditApplicableToProfile(profile, name, mapping, overrides)) continue;
		let context = freshnessContexts.get(project.path);
		if (!context) {
			context = createAuditFreshnessContext();
			freshnessContexts.set(project.path, context);
		}
		const freshness = await evaluateAuditReportFreshness(project.path, name, { context });
		if (freshness.status === 'missing') {
			missingReportCount++;
		} else if (freshness.status === 'stale') {
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
	resolveScoringRoots: () => string[]
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

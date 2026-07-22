import { type ProjectAssuranceProfile } from 'aidd-shared';
import {
	evaluateAuditReportFreshness,
	type AuditFreshnessContext,
} from 'aidd-shared/metadata/audit-freshness';
import {
	MATURITY_SKIP_FILE,
	MATURITY_STALE_DAYS,
	type MaturityArtifactRef,
} from 'aidd-shared/metadata/maturity';
import { metadataPath } from 'aidd-shared/metadata/paths';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	MaturityArtifactDto,
	MaturityArtifactStatus,
	MaturityAuditEntryDto,
	ProjectArtifactCheckSummary,
	ProjectInterviewProgress,
	WebFeatureStats,
} from '../../types.ts';

import { readJsonOrNull, statOrNull } from '../fsHelpers.ts';

const STALE_MS = MATURITY_STALE_DAYS * 86_400_000;
const CHANGELOG_PROBE_BYTES = 4096;

export interface MaturityComputeInput {
	artifactCheck: null | ProjectArtifactCheckSummary;
	auditCatalogDir: string;
	auditCatalogNames: string[];
	auditFreshnessContext?: AuditFreshnessContext;
	featureStats: WebFeatureStats;
	interview: null | ProjectInterviewProgress;
	latestProjectAuditRun: {
		finishedAt: null | number;
		runId: string;
		status: string;
	} | null;
	profile: ProjectAssuranceProfile;
	projectDir: string;
}

interface MaturitySkipFileShape {
	skip?: unknown;
	updatedAt?: unknown;
}

export async function loadMaturitySkip(projectDir: string): Promise<string[]> {
	// Must use the shared constant: this read hardcoded 'maturity-skip.json' while the writer in
	// services/project/profile.ts emitted 'maturity.json', so every skip was silently discarded.
	const path = join(metadataPath(projectDir), MATURITY_SKIP_FILE);
	const parsed = await readJsonOrNull<MaturitySkipFileShape>(path);
	if (!parsed || !Array.isArray(parsed.skip)) return [];
	return parsed.skip.filter((item): item is string => typeof item === 'string');
}

function freshnessFromMtime(mtimeMs: null | number): MaturityArtifactStatus {
	if (mtimeMs === null) return 'missing';
	const ageMs = Date.now() - mtimeMs;
	return ageMs > STALE_MS ? 'stale' : 'fresh';
}

function findCatalogArtifact(
	check: null | ProjectArtifactCheckSummary,
	slug: string
): { mtime: null | string; status: MaturityArtifactStatus } {
	if (!check) return { mtime: null, status: 'missing' };
	const record = check.artifacts.find(
		(item) => item.label === slug || item.path.endsWith(`.aidd/${slug}`)
	);
	if (!record || !record.exists) return { mtime: null, status: 'missing' };
	return {
		mtime: record.mtime,
		status: record.freshness === 'fresh' ? 'fresh' : 'stale',
	};
}

async function classifyFsFile(
	projectDir: string,
	relativePath: string
): Promise<{ mtime: null | string; status: MaturityArtifactStatus }> {
	const stats = await statOrNull(join(projectDir, relativePath));
	if (!stats) return { mtime: null, status: 'missing' };
	return {
		mtime: stats.mtime.toISOString(),
		status: freshnessFromMtime(stats.mtimeMs),
	};
}

async function classifyFsDir(
	projectDir: string,
	relativePath: string
): Promise<{ mtime: null | string; status: MaturityArtifactStatus }> {
	const dirPath = join(projectDir, relativePath);
	const stats = await statOrNull(dirPath);
	if (!stats || !stats.isDirectory()) return { mtime: null, status: 'missing' };
	try {
		const entries = await readdir(dirPath);
		if (entries.length === 0) return { mtime: stats.mtime.toISOString(), status: 'missing' };
	} catch {
		return { mtime: null, status: 'missing' };
	}
	return {
		mtime: stats.mtime.toISOString(),
		status: freshnessFromMtime(stats.mtimeMs),
	};
}

// Deploy config and release tags are presence evidence: existing config does
// not go stale the way narrative artifacts do, so neither classifier applies
// the mtime staleness window.
async function classifyFsAny(
	projectDir: string,
	relativePaths: readonly string[]
): Promise<{ mtime: null | string; status: MaturityArtifactStatus }> {
	for (const relativePath of relativePaths) {
		const fullPath = join(projectDir, relativePath);
		const stats = await statOrNull(fullPath);
		if (!stats) continue;
		if (stats.isDirectory()) {
			try {
				const entries = await readdir(fullPath);
				if (entries.length === 0) continue;
			} catch {
				continue;
			}
		}
		return { mtime: stats.mtime.toISOString(), status: 'fresh' };
	}
	return { mtime: null, status: 'missing' };
}

// Detects a tagged release from the repository's own files (.git/refs/tags or
// packed-refs) so project listings never spawn a git process.
async function classifyReleaseSynthetic(projectDir: string): Promise<{
	mtime: null | string;
	status: MaturityArtifactStatus;
}> {
	const tagsDir = join(projectDir, '.git', 'refs', 'tags');
	const tagsStats = await statOrNull(tagsDir);
	if (tagsStats?.isDirectory()) {
		try {
			const entries = await readdir(tagsDir);
			if (entries.length > 0)
				return { mtime: tagsStats.mtime.toISOString(), status: 'fresh' };
		} catch {
			// fall through to packed-refs
		}
	}
	const packedPath = join(projectDir, '.git', 'packed-refs');
	const packedStats = await statOrNull(packedPath);
	if (packedStats) {
		try {
			const content = await readFile(packedPath, { encoding: 'utf8' });
			const hasTag = content.split('\n').some((line) => line.includes(' refs/tags/'));
			if (hasTag) return { mtime: packedStats.mtime.toISOString(), status: 'fresh' };
		} catch {
			return { mtime: null, status: 'missing' };
		}
	}
	return { mtime: null, status: 'missing' };
}

function classifyFeatureSynthetic(featureStats: WebFeatureStats): {
	mtime: null | string;
	status: MaturityArtifactStatus;
} {
	return {
		mtime: null,
		status: featureStats.total > 0 ? 'fresh' : 'missing',
	};
}

async function classifyChangelogSynthetic(projectDir: string): Promise<{
	mtime: null | string;
	status: MaturityArtifactStatus;
}> {
	const path = join(metadataPath(projectDir), 'CHANGELOG.md');
	const stats = await statOrNull(path);
	if (!stats) return { mtime: null, status: 'missing' };
	try {
		const fh = await readFile(path, { encoding: 'utf8' });
		const head = fh.slice(0, CHANGELOG_PROBE_BYTES);
		const hasEntry = head
			.split('\n')
			.some((line) => line.trim().length > 0 && !line.trim().startsWith('#'));
		if (!hasEntry) return { mtime: stats.mtime.toISOString(), status: 'missing' };
	} catch {
		return { mtime: stats.mtime.toISOString(), status: 'missing' };
	}
	return {
		mtime: stats.mtime.toISOString(),
		status: freshnessFromMtime(stats.mtimeMs),
	};
}

function applyInterviewDowngrade(
	status: MaturityArtifactStatus,
	interview: null | ProjectInterviewProgress
): MaturityArtifactStatus {
	if (status !== 'fresh' && status !== 'stale') return status;
	if (!interview || interview.total === 0) return status;
	if (interview.answered >= interview.total) return status;
	return 'stale';
}

export async function classifyArtifact(
	artifact: MaturityArtifactRef,
	input: MaturityComputeInput,
	skip: Set<string>
): Promise<{ mtime: null | string; status: MaturityArtifactStatus }> {
	if (skip.has(artifact.slug)) return { mtime: null, status: 'skipped' };
	switch (artifact.kind) {
		case 'audit-dynamic':
			return { mtime: null, status: 'missing' };
		case 'catalog': {
			const c = findCatalogArtifact(input.artifactCheck, artifact.slug);
			if (artifact.slug === 'questions.md') {
				return {
					mtime: c.mtime,
					status: applyInterviewDowngrade(c.status, input.interview),
				};
			}
			return c;
		}
		case 'fs-any':
			return await classifyFsAny(input.projectDir, artifact.relativePaths ?? []);
		case 'fs-dir':
			return await classifyFsDir(input.projectDir, artifact.relativePath ?? artifact.slug);
		case 'fs-file':
			return await classifyFsFile(input.projectDir, artifact.relativePath ?? artifact.slug);
		case 'synthetic-changelog':
			return await classifyChangelogSynthetic(input.projectDir);
		case 'synthetic-feature':
			return classifyFeatureSynthetic(input.featureStats);
		case 'synthetic-release':
			return await classifyReleaseSynthetic(input.projectDir);
	}
}

export interface AuditClassification {
	artifact: MaturityArtifactDto;
	entry: MaturityAuditEntryDto;
}

export async function classifyAuditEntry(
	auditName: string,
	projectDir: string,
	skip: Set<string>,
	latestRun: MaturityComputeInput['latestProjectAuditRun'],
	freshnessContext: AuditFreshnessContext
): Promise<AuditClassification> {
	const slug = `audit:${auditName}`;
	const skipped = skip.has(slug) || skip.has(auditName);
	const reportFreshness = await evaluateAuditReportFreshness(projectDir, auditName, {
		context: freshnessContext,
	});
	const freshness: MaturityAuditEntryDto['freshness'] = reportFreshness.status;
	const status: MaturityArtifactStatus = skipped
		? 'skipped'
		: freshness === 'fresh'
			? 'fresh'
			: freshness === 'stale'
				? 'stale'
				: 'missing';
	const entry: MaturityAuditEntryDto = {
		ageDays: reportFreshness.ageDays,
		auditName,
		changes: reportFreshness.changes,
		freshness,
		lastReportAt: reportFreshness.lastReportAt,
		lastRunFinishedAt:
			latestRun?.finishedAt !== null && latestRun?.finishedAt !== undefined
				? new Date(latestRun.finishedAt).toISOString()
				: null,
		lastRunId: latestRun?.runId ?? null,
		lastRunStatus: latestRun
			? latestRun.status === 'completed'
				? 'success'
				: latestRun.status === 'failed' || latestRun.status === 'killed'
					? 'failure'
					: null
			: null,
		skipped,
		staleReasons: reportFreshness.staleReasons,
	};
	const artifact: MaturityArtifactDto = {
		audit: entry,
		kind: 'audit-dynamic',
		label: auditName,
		mtime: entry.lastReportAt,
		required: true,
		slug,
		status,
	};
	return { artifact, entry };
}

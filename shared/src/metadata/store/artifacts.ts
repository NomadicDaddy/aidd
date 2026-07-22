import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { detectInitialPhase, type InitialPhase } from '../onboarding.ts';

export type ArtifactSeverity = 'optional' | 'recommended' | 'required';

export interface ArtifactStatus {
	ageDays: null | number;
	exists: boolean;
	freshness: 'fresh' | 'missing' | 'stale';
	label: string;
	mtime: null | string;
	path: string;
	severity: ArtifactSeverity;
	sizeBytes: number;
}

export interface ArtifactCheckResult {
	artifacts: ArtifactStatus[];
	checkedAt: string;
	missing: string[];
	path: string;
	phase: InitialPhase;
	// True when the project has not reached the coding phase yet (initializer/onboarding). In that
	// state a missing required artifact — spec.md above all — is expected, so the check stays green.
	preOnboarding: boolean;
	staleThresholdDays: number;
	summary: {
		fresh: number;
		missing: number;
		present: number;
		requiredMissing: number;
		stale: number;
		total: number;
	};
	valid: boolean;
}

export async function runArtifactCheck(
	projectDir: string,
	metadataDir: string
): Promise<ArtifactCheckResult> {
	const checkedAt = new Date();
	const [artifacts, phase] = await Promise.all([
		collectArtifactStatuses(projectDir, checkedAt),
		detectInitialPhase(projectDir),
	]);
	const missing = artifacts
		.filter((artifact) => !artifact.exists && artifact.severity === 'required')
		.map((artifact) => artifact.label);
	// A pre-onboarding codebase (fresh ingest of a legacy app) has no spec.md yet — onboarding
	// creates it later. Reporting that as a hard failure breaks every clean intake, the exact
	// projects intake exists for. Missing required artifacts are informational until the project
	// reaches the coding phase; a genuinely broken aidd-native project (phase 'coding') still fails.
	const preOnboarding = phase !== 'coding';
	const valid = preOnboarding || missing.length === 0;
	const checkedAtIso = checkedAt.toISOString().replace(/\.\d{3}Z$/, 'Z');
	const result = {
		artifacts: Object.fromEntries(
			artifacts.map((artifact) => [
				artifact.label,
				{
					ageDays: artifact.ageDays,
					exists: artifact.exists,
					freshness: artifact.freshness,
					mtime: artifact.mtime,
					path: artifact.path,
					severity: artifact.severity,
					sizeBytes: artifact.sizeBytes,
				},
			])
		),
		checkedAt: checkedAtIso,
		phase,
		preOnboarding,
		project: projectDir,
		staleThresholdDays: 30,
		summary: {
			fresh: artifacts.filter((artifact) => artifact.freshness === 'fresh').length,
			missing: artifacts.filter((artifact) => !artifact.exists).length,
			present: artifacts.filter((artifact) => artifact.exists).length,
			requiredMissing: missing.length,
			stale: artifacts.filter((artifact) => artifact.freshness === 'stale').length,
			total: artifacts.length,
		},
	};
	await mkdir(metadataDir, { recursive: true });
	const path = join(metadataDir, '.artifacts-check.json');
	await writeFile(path, `${JSON.stringify(result, null, 2)}\n`);
	return {
		artifacts,
		checkedAt: checkedAtIso,
		missing,
		path,
		phase,
		preOnboarding,
		staleThresholdDays: 30,
		summary: result.summary,
		valid,
	};
}

export async function collectArtifactStatuses(
	projectDir: string,
	checkedAt: Date
): Promise<ArtifactStatus[]> {
	const catalog: { label: string; path: string; severity: ArtifactSeverity }[] = [
		{ label: 'CONTEXT.md', path: 'CONTEXT.md', severity: 'required' },
		{ label: 'spec.md', path: '.aidd/spec.md', severity: 'required' },
		{ label: 'assertions.md', path: '.aidd/assertions.md', severity: 'recommended' },
		{
			label: 'project-structure.md',
			path: '.aidd/project-structure.md',
			severity: 'recommended',
		},
		{ label: 'project.md', path: '.aidd/project.md', severity: 'recommended' },
		{ label: 'roadmap.json', path: '.aidd/roadmap.json', severity: 'recommended' },
		{
			label: 'project-profile.json',
			path: '.aidd/project-profile.json',
			severity: 'recommended',
		},
		{ label: 'screen-map.md', path: '.aidd/screen-map.md', severity: 'recommended' },
		{
			label: 'testing-scenarios.md',
			path: '.aidd/testing-scenarios.md',
			severity: 'recommended',
		},
		{ label: 'questions.md', path: '.aidd/questions.md', severity: 'optional' },
		{ label: 'responses.md', path: '.aidd/responses.md', severity: 'optional' },
		{ label: 'responses/', path: '.aidd/responses', severity: 'optional' },
	];
	const now = checkedAt.getTime();
	return await Promise.all(
		catalog.map(async (entry) => {
			const fullPath = join(projectDir, entry.path);
			try {
				const stats = await stat(fullPath);
				const ageDays = Math.floor((now - stats.mtime.getTime()) / 86_400_000);
				const freshness = ageDays > 30 ? 'stale' : 'fresh';
				return {
					...entry,
					ageDays,
					exists: true,
					freshness,
					mtime: stats.mtime.toISOString().replace(/\.\d{3}Z$/, 'Z'),
					sizeBytes: stats.isDirectory() ? 0 : stats.size,
				} satisfies ArtifactStatus;
			} catch {
				return {
					...entry,
					ageDays: null,
					exists: false,
					freshness: 'missing',
					mtime: null,
					sizeBytes: 0,
				} satisfies ArtifactStatus;
			}
		})
	);
}

import { join } from 'node:path';

import type {
	ProjectArtifactCheckSummary,
	ProjectArtifactFreshness,
	ProjectArtifactRecord,
	ProjectArtifactSeverity,
} from '../../types.ts';

import { readJsonOrNull } from '../fsHelpers.ts';

const artifactSeverities: readonly ProjectArtifactSeverity[] = [
	'optional',
	'recommended',
	'required',
];

const artifactFreshnessValues: readonly ProjectArtifactFreshness[] = ['fresh', 'missing', 'stale'];

function parseArtifactRecords(value: unknown): ProjectArtifactRecord[] {
	if (!value || typeof value !== 'object') return [];
	const records: ProjectArtifactRecord[] = [];
	for (const [label, raw] of Object.entries(value as Record<string, unknown>)) {
		if (!raw || typeof raw !== 'object') continue;
		const entry = raw as Record<string, unknown>;
		const path = entry.path;
		const severity = entry.severity;
		const exists = entry.exists;
		const mtime = entry.mtime;
		const ageDays = entry.ageDays;
		const freshness = entry.freshness;
		const sizeBytes = entry.sizeBytes;
		if (typeof path !== 'string') continue;
		if (
			typeof severity !== 'string' ||
			!(artifactSeverities as readonly string[]).includes(severity)
		) {
			continue;
		}
		if (typeof exists !== 'boolean') continue;
		if (mtime !== null && typeof mtime !== 'string') continue;
		if (ageDays !== null && typeof ageDays !== 'number') continue;
		if (
			typeof freshness !== 'string' ||
			!(artifactFreshnessValues as readonly string[]).includes(freshness)
		) {
			continue;
		}
		if (typeof sizeBytes !== 'number') continue;
		records.push({
			ageDays,
			exists,
			freshness: freshness as ProjectArtifactFreshness,
			label,
			mtime,
			path,
			severity: severity as ProjectArtifactSeverity,
			sizeBytes,
		});
	}
	return records;
}

export async function gatherArtifactCheckSummary(
	metadataDir: string
): Promise<null | ProjectArtifactCheckSummary> {
	const cachePath = join(metadataDir, '.artifacts-check.json');
	const parsed = await readJsonOrNull<{
		artifacts?: unknown;
		checkedAt?: unknown;
		staleThresholdDays?: unknown;
		summary?: Record<string, unknown>;
	}>(cachePath);
	if (!parsed) return null;
	if (typeof parsed.checkedAt !== 'string') return null;
	if (typeof parsed.staleThresholdDays !== 'number') return null;
	if (!parsed.summary || typeof parsed.summary !== 'object') return null;
	const numericKeys = [
		'total',
		'present',
		'missing',
		'fresh',
		'stale',
		'requiredMissing',
	] as const;
	const counts: Partial<Record<(typeof numericKeys)[number], number>> = {};
	for (const key of numericKeys) {
		const value = (parsed.summary as Record<string, unknown>)[key];
		if (typeof value !== 'number') return null;
		counts[key] = value;
	}
	return {
		artifacts: parseArtifactRecords(parsed.artifacts),
		checkedAt: parsed.checkedAt,
		staleThresholdDays: parsed.staleThresholdDays,
		summary: {
			fresh: counts.fresh ?? 0,
			missing: counts.missing ?? 0,
			present: counts.present ?? 0,
			requiredMissing: counts.requiredMissing ?? 0,
			stale: counts.stale ?? 0,
			total: counts.total ?? 0,
		},
	};
}

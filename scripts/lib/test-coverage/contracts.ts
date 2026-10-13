import { sep } from 'node:path';

import { TEST_COVERAGE_DIR } from '../smoke-cache/coverage.ts';

export const COVERAGE_SUMMARY_PATH = `${TEST_COVERAGE_DIR}/area-summary.json`;

/** A floor farther below measured coverage cannot catch a meaningful regression. */
export const MAX_THRESHOLD_SLACK = 6;

export interface CoverageCounts {
	covered: number;
	total: number;
}

export interface CoverageThresholds {
	functions: number;
	lines: number;
	modules: number;
}

export interface CoverageArea {
	id: CoverageAreaId;
	prefix: string;
	thresholds: CoverageThresholds;
}

export interface FileCoverageMetrics {
	functions: CoverageCounts;
	lines: CoverageCounts;
	path: string;
}

export const COVERAGE_AREAS = [
	// Floors sit about two points under the coverage measured on 2026-10-07 (backend 93.2 / 88.9 /
	// 88.4 modules / lines / functions, cli 94.5 / 90.5 / 93.9, frontend 25.7 / 79.6 / 79.5,
	// scripts 66.4 / 73.5 / 83.5, shared 96.0 / 94.4 / 96.0). A floor further below than
	// MAX_THRESHOLD_SLACK lets a large regression through, and the report says so; raise the floor
	// when it does, never widen the slack.
	//
	// The scripts floors were set again on 2026-10-13, when delivered files left the count (see
	// delivered.ts; Phillip, room #9942). The earlier measurement included this repository's own
	// tests of the shared-core sync, which moved to the sync's owner with the sync. Measured
	// without delivered files: 69.8 / 69.9 / 81.4, and the floors sit about two points under
	// that by the same rule as the rest.
	{
		id: 'backend',
		prefix: 'backend/src/',
		thresholds: { functions: 86, lines: 86, modules: 90 },
	},
	{
		id: 'cli',
		prefix: 'cli/src/',
		thresholds: { functions: 92, lines: 87, modules: 91 },
	},
	{
		id: 'frontend',
		prefix: 'frontend/src/',
		thresholds: { functions: 77, lines: 77, modules: 24 },
	},
	{
		id: 'scripts',
		prefix: 'scripts/',
		thresholds: { functions: 79, lines: 67, modules: 67 },
	},
	{
		id: 'shared',
		prefix: 'shared/src/',
		thresholds: { functions: 94, lines: 92, modules: 94 },
	},
] as const satisfies readonly CoverageArea[];

export type CoverageAreaId = 'backend' | 'cli' | 'frontend' | 'scripts' | 'shared';

export function normalizeProjectPath(path: string): string {
	return path.split(sep).join('/').replaceAll('\\', '/');
}

export function coverageAreaForPath(path: string): CoverageArea | undefined {
	const normalized = normalizeProjectPath(path);
	return COVERAGE_AREAS.find((area) => normalized.startsWith(area.prefix));
}

export function isProductionSourcePath(path: string): boolean {
	const normalized = normalizeProjectPath(path);
	return (
		coverageAreaForPath(normalized) !== undefined &&
		/\.[cm]?[jt]sx?$/.test(normalized) &&
		!normalized.endsWith('.d.ts') &&
		!/(^|\/)[^/]+\.(?:spec|test)\.[cm]?[jt]sx?$/.test(normalized)
	);
}

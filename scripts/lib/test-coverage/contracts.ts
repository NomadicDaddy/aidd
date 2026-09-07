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
	{
		id: 'backend',
		prefix: 'backend/src/',
		thresholds: { functions: 82, lines: 81, modules: 90 },
	},
	{
		id: 'cli',
		prefix: 'cli/src/',
		thresholds: { functions: 92, lines: 87, modules: 91 },
	},
	{
		id: 'frontend',
		prefix: 'frontend/src/',
		thresholds: { functions: 73, lines: 71, modules: 24 },
	},
	{
		id: 'scripts',
		prefix: 'scripts/',
		thresholds: { functions: 66, lines: 67, modules: 57 },
	},
	{
		id: 'shared',
		prefix: 'shared/src/',
		thresholds: { functions: 90, lines: 87, modules: 94 },
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

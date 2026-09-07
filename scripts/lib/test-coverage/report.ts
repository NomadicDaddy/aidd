import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { TEST_COVERAGE_LCOV_PATH } from '../smoke-cache/coverage.ts';
import {
	COVERAGE_AREAS,
	type CoverageArea,
	type CoverageAreaId,
	type CoverageCounts,
	type CoverageThresholds,
	type FileCoverageMetrics,
	isProductionSourcePath,
	MAX_THRESHOLD_SLACK,
	normalizeProjectPath,
} from './contracts.ts';
import { parseProductionLcov } from './lcov.ts';

export interface AreaCoverageReport {
	failures: string[];
	functions: CoverageCounts;
	id: CoverageAreaId;
	lines: CoverageCounts;
	modules: CoverageCounts;
	slack: string[];
	thresholds: CoverageThresholds;
}

export interface CoverageReport {
	areas: AreaCoverageReport[];
	branchCoverage: {
		available: false;
		reason: string;
	};
	generatedAt: string;
	passed: boolean;
}

function addCounts(target: CoverageCounts, value: CoverageCounts): void {
	target.covered += value.covered;
	target.total += value.total;
}

export function coveragePercent(counts: CoverageCounts): number {
	return counts.total === 0 ? 100 : (counts.covered / counts.total) * 100;
}

function thresholdFailures(
	metrics: Pick<AreaCoverageReport, 'functions' | 'lines' | 'modules'>,
	thresholds: CoverageThresholds,
): string[] {
	return (['functions', 'lines', 'modules'] as const).flatMap((metric) => {
		const counts = metrics[metric];
		const required = thresholds[metric];
		const actual = coveragePercent(counts);
		return actual < required
			? [`${metric} ${actual.toFixed(1)}% is below ${required.toFixed(1)}%`]
			: [];
	});
}

function thresholdSlack(
	metrics: Pick<AreaCoverageReport, 'functions' | 'lines' | 'modules'>,
	thresholds: CoverageThresholds,
): string[] {
	return (['functions', 'lines', 'modules'] as const).flatMap((metric) => {
		const actual = coveragePercent(metrics[metric]);
		const slack = actual - thresholds[metric];
		return slack > MAX_THRESHOLD_SLACK
			? [`${metric} floor is ${slack.toFixed(1)} points below measured coverage`]
			: [];
	});
}

function reportArea(
	area: CoverageArea,
	inventory: string[],
	lcovFiles: Map<string, FileCoverageMetrics>,
): AreaCoverageReport {
	const metrics = {
		functions: { covered: 0, total: 0 },
		lines: { covered: 0, total: 0 },
		modules: {
			covered: inventory.filter((path) => lcovFiles.has(path)).length,
			total: inventory.length,
		},
	};

	for (const [path, file] of lcovFiles) {
		if (!path.startsWith(area.prefix)) continue;
		addCounts(metrics.functions, file.functions);
		addCounts(metrics.lines, file.lines);
	}

	return {
		...metrics,
		failures: thresholdFailures(metrics, area.thresholds),
		id: area.id,
		slack: thresholdSlack(metrics, area.thresholds),
		thresholds: area.thresholds,
	};
}

export function buildCoverageReport(
	inventory: string[],
	lcovFiles: Map<string, FileCoverageMetrics>,
	areas: readonly CoverageArea[] = COVERAGE_AREAS,
): CoverageReport {
	const areaReports = areas.map((area) =>
		reportArea(
			area,
			inventory.filter((path) => path.startsWith(area.prefix)),
			lcovFiles,
		),
	);
	return {
		areas: areaReports,
		branchCoverage: {
			available: false,
			reason: `Bun ${Bun.version} does not emit branch records in LCOV.`,
		},
		generatedAt: new Date().toISOString(),
		passed: areaReports.every((area) => area.failures.length === 0),
	};
}

export async function collectProductionModules(projectRoot: string): Promise<string[]> {
	const modules = new Set<string>();
	for (const area of COVERAGE_AREAS) {
		for (const extension of ['js', 'jsx', 'ts', 'tsx', 'mjs', 'mts', 'cjs', 'cts']) {
			const glob = new Bun.Glob(`${area.prefix}**/*.${extension}`);
			for await (const path of glob.scan({ cwd: projectRoot, onlyFiles: true })) {
				const normalized = normalizeProjectPath(path);
				if (isProductionSourcePath(normalized)) modules.add(normalized);
			}
		}
	}
	return [...modules].sort();
}

export async function createCoverageReport(projectRoot: string): Promise<CoverageReport> {
	const lcov = await readFile(resolve(projectRoot, TEST_COVERAGE_LCOV_PATH), 'utf8');
	return buildCoverageReport(
		await collectProductionModules(projectRoot),
		parseProductionLcov(projectRoot, lcov),
	);
}

function formatMetric(counts: CoverageCounts): string {
	return `${coveragePercent(counts).toFixed(1)}% (${counts.covered}/${counts.total})`;
}

export function printCoverageReport(report: CoverageReport): void {
	console.log('\nProduction coverage by area (test files excluded)');
	console.log('Area       Modules          Lines            Functions');
	for (const area of report.areas) {
		console.log(
			`${area.id.padEnd(10)} ${formatMetric(area.modules).padEnd(16)} ${formatMetric(area.lines).padEnd(16)} ${formatMetric(area.functions)}`,
		);
		for (const failure of area.failures) console.error(`  [FAIL] ${area.id}: ${failure}`);
		for (const warning of area.slack) console.error(`  [WARN] ${area.id}: ${warning}`);
	}
	console.log(`Branches: n/a (${report.branchCoverage.reason})`);
	console.log(report.passed ? 'Coverage thresholds passed.' : 'Coverage thresholds failed.');
}

export async function writeCoverageReport(path: string, report: CoverageReport): Promise<void> {
	await writeFile(path, `${JSON.stringify(report, null, '\t')}\n`, 'utf8');
}

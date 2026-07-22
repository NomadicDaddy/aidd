#!/usr/bin/env bun
/**
 * Fleet-wide feature-review sweep.
 *
 * Walks every application listed in the workspace applications index, normalizes each
 * feature blueprint against the canonical schema, runs the public aidd feature contract
 * validator over the result, and writes a per-app report plus one aggregate report under
 * `reports/`.
 *
 * The sweep is deliberately conservative: it repairs only mechanical damage (missing or
 * trailing commas, legacy key names, string-typed scalars, unresolved dependency labels)
 * and reports anything that needs human judgement as a manual follow-up. A dirty-repo
 * guard records any file the sweep touched outside a feature blueprint or `.aidd/reports/`,
 * so an unexpected mutation shows up in the report rather than silently landing in an app's
 * working tree.
 *
 *   bun scripts/feature-review-sweep.ts [--apps <csv>] [--dry-run] [--report-only]
 */
import process from 'node:process';

import { AGGREGATE_REPORT_PATH } from './lib/feature-review-sweep/constants.ts';
import { discoverApps } from './lib/feature-review-sweep/discovery.ts';
import { parseSweepArgs, resolveMode } from './lib/feature-review-sweep/options.ts';
import { buildAggregateReport, writeFileIfNeeded } from './lib/feature-review-sweep/report.ts';
import { scanApp } from './lib/feature-review-sweep/scan.ts';
import { type RunSummary, type RunTotals } from './lib/feature-review-sweep/types.ts';

function main(): void {
	const options = parseSweepArgs(process.argv.slice(2));
	const apps = discoverApps(options.apps);

	if (apps.length === 0) {
		throw new Error('No apps with .aidd/features matched the requested scope');
	}

	const appSummaries = apps.map((app) => scanApp(app, options));
	const totals: RunTotals = {
		autoClosedRedundant: appSummaries.reduce((sum, item) => sum + item.autoClosedRedundant, 0),
		backlogSemanticFixes: appSummaries.reduce(
			(sum, item) => sum + item.backlogSemanticFixes,
			0
		),
		complianceFixes: appSummaries.reduce((sum, item) => sum + item.complianceFixes, 0),
		invalidJsonRepairs: appSummaries.reduce((sum, item) => sum + item.invalidJsonRepairs, 0),
		manualFollowUps: appSummaries.reduce((sum, item) => sum + item.manualFollowUps.length, 0),
		totalFeatures: appSummaries.reduce((sum, item) => sum + item.before.total, 0),
		unsafeDiffs: appSummaries.reduce((sum, item) => sum + item.unsafeDiffs.length, 0),
	};

	const runSummary: RunSummary = {
		apps: appSummaries,
		mode: resolveMode(options),
		options,
		totals,
	};

	if (!options.dryRun) {
		writeFileIfNeeded(AGGREGATE_REPORT_PATH, buildAggregateReport(runSummary));
	}

	console.log(
		JSON.stringify(
			{
				aggregateReport: options.dryRun ? null : AGGREGATE_REPORT_PATH,
				appCount: appSummaries.length,
				apps: appSummaries.map((item) => ({
					backlog: item.before.backlog,
					completed: item.before.completed,
					invalidJsonAfter: item.after.invalidJson,
					invalidJsonBefore: item.before.invalidJson,
					legacyAcceptanceCriteriaAfter: item.after.legacyAcceptanceCriteria,
					legacyFileLocationsAfter: item.after.legacyFileLocations,
					manualFollowUps: item.manualFollowUps.length,
					mixedSchemaAfter: item.after.mixedSchema,
					name: item.app.name,
					root: item.app.root,
					total: item.before.total,
					validator: item.validator.skipped
						? 'skipped'
						: item.validator.ok
							? 'PASS'
							: 'FAIL',
					verified: item.before.verified,
				})),
				mode: runSummary.mode,
				totals,
			},
			null,
			2
		)
	);
}

try {
	main();
} catch (err) {
	console.error(`[feature-review-sweep] ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
}

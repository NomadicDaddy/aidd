import fs from 'node:fs';
import path from 'node:path';

import { BACKLOG_STATUSES, TODAY } from './constants.ts';
import { getGitStatusPaths, isAllowedAppMutation, runValidator } from './git-guard.ts';
import { buildAfterSummary, buildInventorySummary, collectDuplicateHints } from './inventory.ts';
import { detectIndent, detectNewline, parseJsonWithRepair, stringifyJson } from './json-repair.ts';
import { normalizeFeature } from './normalize.ts';
import { resolveMode } from './options.ts';
import { buildPerAppReport, writeFileIfNeeded } from './report.ts';
import {
	type AppSummary,
	type DiscoveredApp,
	type FeatureRecord,
	type NormalizeContext,
	type SweepOptions,
	type ValidatorResult,
} from './types.ts';
import { uniqueValues } from './util.ts';

interface ReadFeaturesResult {
	features: FeatureRecord[];
	orphanDirs: number;
	orphanPaths: string[];
}

function readFeatures(featuresDir: string): ReadFeaturesResult {
	const featureDirs = fs
		.readdirSync(featuresDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory());
	const features: FeatureRecord[] = [];
	const orphanPaths: string[] = [];
	let orphanDirs = 0;

	for (const dirEntry of featureDirs) {
		const dir = dirEntry.name;
		const filePath = path.join(featuresDir, dir, 'feature.json');
		if (!fs.existsSync(filePath)) {
			orphanDirs += 1;
			orphanPaths.push(path.join(featuresDir, dir));
			continue;
		}

		const rawText = fs.readFileSync(filePath, 'utf8');
		let initiallyInvalid = false;
		try {
			JSON.parse(rawText);
		} catch {
			initiallyInvalid = true;
		}
		const parsed = parseJsonWithRepair(rawText);
		features.push({
			dir,
			filePath,
			indent: detectIndent(rawText),
			initiallyInvalid,
			json: parsed.json,
			newline: detectNewline(rawText),
			parseError: parsed.error ?? null,
			rawText,
			wasRepaired: parsed.repaired,
		});
	}

	return { features, orphanDirs, orphanPaths };
}

type ResolutionMaps = Pick<NormalizeContext, 'dirMap' | 'idMap' | 'titleMap'>;

function buildResolutionMaps(features: FeatureRecord[]): ResolutionMaps {
	const idMap = new Set<string>();
	const dirMap = new Map<string, string>();
	const titleMap = new Map<string, string[]>();

	for (const feature of features) {
		if (!feature.json) {
			continue;
		}
		const id = String(feature.json['id'] ?? '') || feature.dir;
		idMap.add(id);
		dirMap.set(feature.dir, id);
		const title = feature.json['title'];
		if (typeof title === 'string' && title.trim()) {
			const items = titleMap.get(title.trim()) ?? [];
			items.push(id);
			titleMap.set(title.trim(), items);
		}
	}

	return { dirMap, idMap, titleMap };
}

interface NormalizeAllResult {
	backlogSemanticFixes: number;
	complianceFixes: number;
	invalidJsonRepairs: number;
	manualFollowUps: string[];
	touchedFeatureFiles: number;
}

function normalizeAll(
	features: FeatureRecord[],
	maps: ResolutionMaps,
	options: SweepOptions
): NormalizeAllResult {
	let invalidJsonRepairs = 0;
	let complianceFixes = 0;
	let backlogSemanticFixes = 0;
	let touchedFeatureFiles = 0;
	const manualFollowUps: string[] = [];

	for (const feature of features) {
		if (!feature.json) {
			manualFollowUps.push(
				`${feature.dir}: invalid JSON could not be safely repaired (${feature.parseError})`
			);
			feature.finalJson = null;
			continue;
		}

		const normalized = normalizeFeature(feature.json, {
			dir: feature.dir,
			id: String(feature.json['id'] ?? '') || feature.dir,
			...maps,
		});
		feature.finalJson = normalized.json;
		feature.actions = normalized.actions;
		feature.manualFollowUps = normalized.manualFollowUps;
		manualFollowUps.push(...normalized.manualFollowUps);

		const complianceActionCount = normalized.actions.filter(
			(action) => !action.startsWith('backfilled verificationEvidence')
		).length;
		const semanticActionCount = BACKLOG_STATUSES.has(String(normalized.json['status']))
			? normalized.actions.filter((action) =>
					action.startsWith('backfilled verificationEvidence')
				).length
			: 0;
		complianceFixes += complianceActionCount;
		backlogSemanticFixes += semanticActionCount;
		if (feature.wasRepaired) {
			invalidJsonRepairs += 1;
		}

		feature.nextText = stringifyJson(feature.finalJson, feature.indent, feature.newline);
		feature.changed = feature.nextText !== feature.rawText;

		if (!options.dryRun && !options.reportOnly && feature.changed) {
			fs.writeFileSync(feature.filePath, feature.nextText, 'utf8');
			touchedFeatureFiles += 1;
		}
	}

	return {
		backlogSemanticFixes,
		complianceFixes,
		invalidJsonRepairs,
		manualFollowUps,
		touchedFeatureFiles,
	};
}

export function scanApp(app: DiscoveredApp, options: SweepOptions): AppSummary {
	const { features, orphanDirs, orphanPaths } = readFeatures(app.featuresDir);
	const baselineGit = getGitStatusPaths(app.root);
	const before = buildInventorySummary(features, orphanDirs);
	const maps = buildResolutionMaps(features);
	const fixes = normalizeAll(features, maps, options);
	const manualFollowUps = [...fixes.manualFollowUps];

	const duplicateHints = collectDuplicateHints(features);
	for (const items of duplicateHints) {
		manualFollowUps.push(`possible duplicate backlog features: ${items.join(', ')}`);
	}

	let removedOrphanDirs = 0;
	if (!options.dryRun && !options.reportOnly) {
		for (const orphanPath of orphanPaths) {
			fs.rmSync(orphanPath, { force: true, recursive: true });
			removedOrphanDirs += 1;
		}
	}

	const after = buildAfterSummary(
		features,
		!options.dryRun && !options.reportOnly ? orphanDirs - removedOrphanDirs : orphanDirs
	);
	const validator: ValidatorResult = options.dryRun
		? { ok: false, reason: 'dry-run', skipped: true }
		: runValidator(app.root);

	const reportPath = path.join(app.root, '.aidd', 'reports', `feature-review-${TODAY}.md`);
	const unsafeDiffs: string[] = [];

	const summary: AppSummary = {
		after,
		app,
		autoClosedRedundant: 0,
		backlogSemanticFixes: fixes.backlogSemanticFixes,
		before,
		complianceFixes: fixes.complianceFixes,
		duplicateHints,
		invalidJsonRepairs: fixes.invalidJsonRepairs,
		manualFollowUps: uniqueValues(manualFollowUps),
		mode: resolveMode(options),
		options,
		removedOrphanDirs,
		reportsWritten: 0,
		touchedFeatureFiles: fixes.touchedFeatureFiles,
		unsafeDiffs,
		validator,
	};

	if (!options.dryRun && writeFileIfNeeded(reportPath, buildPerAppReport(summary))) {
		summary.reportsWritten = 1;
	}

	const afterGit = getGitStatusPaths(app.root);
	if (baselineGit.ok && afterGit.ok) {
		unsafeDiffs.push(
			...afterGit.paths
				.filter((item) => !baselineGit.paths.includes(item))
				.filter((item) => !isAllowedAppMutation(item))
		);
	}

	// Re-render once the dirty-repo guard and report count are known: the first write is what
	// creates the report file, and writing it is itself a diff the guard must be able to see.
	if (!options.dryRun) {
		writeFileIfNeeded(reportPath, buildPerAppReport(summary));
	}

	return summary;
}

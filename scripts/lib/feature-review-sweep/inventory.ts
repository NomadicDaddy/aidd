import { BACKLOG_STATUSES } from './constants.ts';
import { analyzeFeature } from './normalize.ts';
import {
	type FeatureJson,
	type FeatureRecord,
	type InventorySummary,
	type StatusBucket,
} from './types.ts';

function summarizeStatus(status: unknown): StatusBucket {
	const value = typeof status === 'string' ? status : '';
	if (BACKLOG_STATUSES.has(value)) {
		return 'backlog';
	}
	if (value === 'completed') {
		return 'completed';
	}
	if (value === 'verified') {
		return 'verified';
	}
	return 'other';
}

function emptySummary(orphanDirs: number): InventorySummary {
	return {
		backlog: 0,
		completed: 0,
		invalidJson: 0,
		legacyAcceptanceCriteria: 0,
		legacyFileLocations: 0,
		missingDependencies: 0,
		mixedSchema: 0,
		orphanDirs,
		other: 0,
		total: 0,
		verified: 0,
	};
}

function applyAnalysis(summary: InventorySummary, json: FeatureJson): void {
	summary.total += 1;
	summary[summarizeStatus(json['status'])] += 1;
	const analysis = analyzeFeature(json);
	if (analysis.legacyAcceptanceCriteria) {
		summary.legacyAcceptanceCriteria += 1;
	}
	if (analysis.legacyFileLocations) {
		summary.legacyFileLocations += 1;
	}
	if (analysis.mixedSchema) {
		summary.mixedSchema += 1;
	}
	if (analysis.missingDependencies) {
		summary.missingDependencies += 1;
	}
}

export function buildInventorySummary(
	features: FeatureRecord[],
	orphanDirs: number
): InventorySummary {
	const summary = emptySummary(orphanDirs);

	for (const feature of features) {
		if (feature.initiallyInvalid) {
			summary.invalidJson += 1;
		}
		if (!feature.json) {
			continue;
		}
		applyAnalysis(summary, feature.json);
	}

	return summary;
}

export function buildAfterSummary(features: FeatureRecord[], orphanDirs: number): InventorySummary {
	const summary = emptySummary(orphanDirs);

	for (const feature of features) {
		if (!feature.finalJson) {
			summary.invalidJson += 1;
			continue;
		}
		applyAnalysis(summary, feature.finalJson);
	}

	return summary;
}

export function collectDuplicateHints(features: FeatureRecord[]): string[][] {
	const bySignature = new Map<string, string[]>();
	for (const feature of features) {
		const active = feature.finalJson ?? feature.json;
		if (!active || !BACKLOG_STATUSES.has(String(active['status']))) {
			continue;
		}

		const rawTitle = active['title'];
		const rawSpec = active['spec'];
		const title = typeof rawTitle === 'string' ? rawTitle.trim().toLowerCase() : '';
		const spec =
			typeof rawSpec === 'string' ? rawSpec.trim().replace(/\s+/g, ' ').toLowerCase() : '';
		if (!title || !spec) {
			continue;
		}

		const signature = `${title}||${spec}`;
		const matches = bySignature.get(signature) ?? [];
		matches.push(String(active['id'] ?? feature.dir));
		bySignature.set(signature, matches);
	}

	return [...bySignature.values()].filter((items) => items.length > 1);
}

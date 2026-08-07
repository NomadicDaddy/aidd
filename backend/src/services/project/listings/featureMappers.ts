import type { Roadmap } from 'aidd-shared/metadata/roadmap';

import { classifyFeatureStatusType, type Feature } from 'aidd-shared/metadata/features';
import { type FileAiddStore } from 'aidd-shared/metadata/store';

import type {
	ProjectFeatureDto,
	WebFeatureStats,
	WebFeatureStatusEntryDto,
	WebFeatureSummaryDto,
} from '../../../types.ts';

export function toWebFeatureStats(
	stats: Awaited<ReturnType<FileAiddStore['getFeatureStats']>>,
): WebFeatureStats {
	return {
		closed: stats.closed,
		dependencyBlocked: stats.dependencyBlocked,
		failing: stats.failing,
		open: stats.open,
		passing: stats.passing,
		total: stats.total,
		waitingApproval: stats.waitingApproval,
	};
}

export function toWebFeatureSummary(features: Feature[]): WebFeatureSummaryDto {
	const summary: WebFeatureSummaryDto = {
		audit: 0,
		completed: 0,
		feature: 0,
		pending: 0,
		remediation: 0,
		total: 0,
	};
	for (const feature of features) {
		const type = classifyFeatureStatusType(feature);
		const completed =
			type === 'audit'
				? feature.status === 'completed' && feature.passes === true
				: feature.status === 'completed';
		summary[type]++;
		if (completed) summary.completed++;
		else summary.pending++;
		summary.total++;
	}
	return summary;
}

function featureIsCompletedForStatus(feature: Feature): boolean {
	const type = classifyFeatureStatusType(feature);
	return type === 'audit'
		? feature.status === 'completed' && feature.passes === true
		: feature.status === 'completed';
}

export function toWebFeatureStatusEntries(features: Feature[]): WebFeatureStatusEntryDto[] {
	return features
		.map((feature) => {
			const directory = feature.directory ?? feature.id;
			return {
				completed: featureIsCompletedForStatus(feature),
				directory,
				id: feature.id,
				priority: feature.priority ?? null,
				status: feature.status ?? null,
				title: feature.title ?? directory,
				type: classifyFeatureStatusType(feature),
			};
		})
		.sort((left, right) => left.directory.localeCompare(right.directory));
}

// The prose fields. Together they were 83% of this repository's own project-detail response —
// 1.74 MB of the 2.23 MB — because every feature carried them and nothing on the page read them
// in bulk. Only `FeatureDetailsDialog` renders them, for one feature at a time, and it now
// fetches that feature from `GET /:id/features/:featureId`. Everything the Features, Dependencies
// and History tabs need to list, filter, sort and paginate stays in the list projection.
//
// `description` and `summary` deliberately survive: the tab filters over them client-side, so
// dropping them would move search to the server as the price of the payload.
const LIST_OMITTED_FEATURE_FIELDS = ['affectedFiles', 'aiddReport', 'notes', 'spec'] as const;

export function withRoadmapMilestones(
	features: Feature[],
	roadmap: Roadmap | undefined,
): ProjectFeatureDto[] {
	return features.map((feature) => {
		const directory = feature.directory ?? feature.id;
		const listed: Record<string, unknown> = {
			...feature,
			milestone: roadmap?.features[directory]?.milestone ?? null,
		};
		for (const field of LIST_OMITTED_FEATURE_FIELDS) delete listed[field];
		return listed as ProjectFeatureDto;
	});
}

// The same milestone stamp for a single full record, so the detail fetch answers with the shape
// the list rows already have plus the prose the list drops.
export function withRoadmapMilestone(
	feature: Feature,
	roadmap: Roadmap | undefined,
): ProjectFeatureDto {
	const directory = feature.directory ?? feature.id;
	return {
		...feature,
		milestone: roadmap?.features[directory]?.milestone ?? null,
	};
}

import type { Roadmap } from 'aidd-shared/metadata/roadmap';

import { classifyFeatureStatusType, type Feature } from 'aidd-shared/metadata/features';
import { type FileAiddStore } from 'aidd-shared/metadata/store';

import type {
	ProjectFeatureDto,
	WebFeatureStatusEntryDto,
	WebFeatureSummaryDto,
	WebFeatureStats,
} from '../../../types.ts';

export function toWebFeatureStats(
	stats: Awaited<ReturnType<FileAiddStore['getFeatureStats']>>
): WebFeatureStats {
	return {
		closed: stats.closed,
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

export function withRoadmapMilestones(
	features: Feature[],
	roadmap: Roadmap | undefined
): ProjectFeatureDto[] {
	return features.map((feature) => {
		const directory = feature.directory ?? feature.id;
		return {
			...feature,
			milestone: roadmap?.features[directory]?.milestone ?? null,
		};
	});
}

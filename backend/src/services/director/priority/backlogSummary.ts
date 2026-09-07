import {
	dependenciesAreSatisfied,
	type Feature,
	isAuditFinding,
} from 'aidd-shared/metadata/features';

import type { DirectorBacklogBreakdown, DirectorBacklogItemSummary } from './types.ts';

import { normalizeSeverity, numericPriority, numericPriorityOrNull } from './helpers.ts';

export function summarizeBacklog(features: Feature[]): DirectorBacklogBreakdown {
	const audit = features.filter((feature) => isOpenBacklog(feature) && isAuditFinding(feature));
	const remediation = features.filter(
		(feature) =>
			isOpenBacklog(feature) &&
			!isAuditFinding(feature) &&
			feature.id.startsWith('remediation-'),
	);
	const regular = features.filter(
		(feature) =>
			isOpenBacklog(feature) &&
			!isAuditFinding(feature) &&
			!feature.id.startsWith('remediation-'),
	);
	const readyRegular = regular.filter((feature) => dependenciesAreSatisfied(feature, features));
	return {
		audit: {
			bySeverity: severityCounts(audit),
			count: audit.length,
			top: topItems(audit),
		},
		feature: {
			blockedCount: regular.length - readyRegular.length,
			count: regular.length,
			readyCount: readyRegular.length,
			top: topItems(readyRegular),
		},
		remediation: {
			count: remediation.length,
			top: topItems(remediation),
		},
	};
}

function isOpenBacklog(feature: Feature): boolean {
	return feature.status === 'backlog' && feature.passes !== true;
}

function severityCounts(features: Feature[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const feature of features) {
		const severity = normalizeSeverity(feature.auditSeverity);
		counts[severity] = (counts[severity] ?? 0) + 1;
	}
	return counts;
}

function topItems(features: Feature[]): DirectorBacklogItemSummary[] {
	return features
		.slice()
		.sort((left, right) => {
			const priorityDelta = numericPriority(left.priority) - numericPriority(right.priority);
			if (priorityDelta !== 0) return priorityDelta;
			return (left.directory ?? left.id).localeCompare(right.directory ?? right.id);
		})
		.slice(0, 5)
		.map((feature) => {
			const item: DirectorBacklogItemSummary = {
				id: feature.directory ?? feature.id,
				priority: numericPriorityOrNull(feature.priority),
				title: feature.title ?? feature.id,
			};
			if (feature.auditSeverity !== undefined)
				item.auditSeverity = String(feature.auditSeverity);
			return item;
		});
}

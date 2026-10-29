import {
	dependenciesAreSatisfied,
	type Feature,
	isAuditFinding,
} from 'aidd-shared/metadata/features';
import { isTemplateOwnedFeature } from 'aidd-shared/metadata/template-ownership';

import type { DirectorBacklogBreakdown, DirectorBacklogItemSummary } from './types.ts';

import { normalizeSeverity, numericPriority, numericPriorityOrNull } from './helpers.ts';

// `runnable` holds the record directories the roadmap gate lets coding take now; null means the
// project has no roadmap yet, which holds nothing back (coding then creates one with every record
// in v1.0).
export function summarizeBacklog(
	features: Feature[],
	templateRepo: boolean,
	runnable: null | ReadonlySet<string> = null,
): DirectorBacklogBreakdown {
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
	return {
		audit: { ...bucket(audit, features, runnable), bySeverity: severityCounts(audit) },
		feature: bucket(regular, features, runnable),
		remediation: bucket(remediation, features, runnable),
		unfolded: unfoldedFindings(features, templateRepo),
	};
}

// A completed finding has done its work once its change is folded into the feature it touched;
// until consolidate-features runs, it stands as a record nobody will pick up. A derived app's
// template-owned records are folded upstream in the template, so they are not this project's.
function unfoldedFindings(
	features: Feature[],
	templateRepo: boolean,
): { count: number; top: DirectorBacklogItemSummary[] } {
	const unfolded = features.filter(
		(feature) =>
			feature.status === 'completed' &&
			feature.passes === true &&
			(isAuditFinding(feature) ||
				(feature.directory ?? feature.id).startsWith('remediation-')) &&
			!isTemplateOwnedFeature(feature, templateRepo),
	);
	return { count: unfolded.length, top: topItems(unfolded) };
}

// A bucket's `top` and readyCount drive runnable suggestions, so they cover only records whose
// dependencies are met and which sit in the roadmap's active milestone; `count` still covers the
// whole backlog for health. A blocked remediation record offered as a suggestion launched a run
// that found nothing eligible (rollshift, 2026-10-22), and a summon finding in milestone v1.1
// launched one the roadmap gate stopped at its first step while v1.0 was active (2026-10-29).
function bucket(
	items: Feature[],
	all: Feature[],
	runnable: null | ReadonlySet<string>,
): { blockedCount: number; count: number; readyCount: number; top: DirectorBacklogItemSummary[] } {
	const ready = items.filter(
		(feature) =>
			dependenciesAreSatisfied(feature, all) &&
			(runnable === null || runnable.has(feature.directory ?? feature.id)),
	);
	return {
		blockedCount: items.length - ready.length,
		count: items.length,
		readyCount: ready.length,
		top: topItems(ready),
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

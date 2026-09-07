import type { ProjectFeature } from '../../../api/types.ts';

import { displayValue, featureDirectory } from './featuresUtils.ts';
import { stringValue } from './shared.ts';

const SEARCH_CONTEXT_RADIUS = 32;

export interface FeatureSearchContext {
	after: string;
	before: string;
	match: string;
	title: string;
}

function normalizedSearchValue(value: unknown): string {
	return displayValue(value).toLowerCase();
}

export function compareFeaturesByTitle(left: ProjectFeature, right: ProjectFeature): number {
	const leftTitle = stringValue(left, 'title') || featureDirectory(left);
	const rightTitle = stringValue(right, 'title') || featureDirectory(right);
	const titleOrder = leftTitle.localeCompare(rightTitle);
	return titleOrder === 0
		? featureDirectory(left).localeCompare(featureDirectory(right))
		: titleOrder;
}

/** Hidden metadata that explains why a visible row matched the active feature query. */
export function featureSearchContext(
	feature: ProjectFeature,
	query: string,
): FeatureSearchContext | null {
	const trimmed = query.trim().toLowerCase();
	if (!trimmed) return null;
	const visibleValues = [featureDirectory(feature), feature.id, feature.title];
	if (visibleValues.some((value) => normalizedSearchValue(value).includes(trimmed))) return null;
	const contexts = [
		{ label: 'Description', value: feature.description },
		{ label: 'Summary', value: feature.summary },
		{ label: 'Category', value: feature.category },
		{ label: 'Audit source', value: feature.auditSource },
		{ label: 'Audit severity', value: feature.auditSeverity },
	];
	const context = contexts.find((candidate) =>
		normalizedSearchValue(candidate.value).includes(trimmed),
	);
	if (!context) return null;
	const value = displayValue(context.value);
	const matchIndex = value.toLowerCase().indexOf(trimmed);
	const start = Math.max(0, matchIndex - SEARCH_CONTEXT_RADIUS);
	const end = Math.min(value.length, matchIndex + trimmed.length + SEARCH_CONTEXT_RADIUS);
	return {
		after: `${value.slice(matchIndex + trimmed.length, end)}${end < value.length ? '…' : ''}`,
		before: `${context.label}: ${start > 0 ? '…' : ''}${value.slice(start, matchIndex)}`,
		match: value.slice(matchIndex, matchIndex + trimmed.length),
		title: `${context.label}: ${value}`,
	};
}

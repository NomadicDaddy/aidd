import type { Feature, FeatureValidationIssue } from './types.ts';

// Selection resumes a started record before any unstarted one, whatever their priorities, so each
// extra in_progress record risks running ahead of higher-priority backlog work, when there is any.
// The count alone can't tell whether that work exists; it only shows when the risk grows. Phillip
// chose resume-first plus a visible count over a hard cap (#33685 on #33682, team rule R24): a
// warning, never an issue, so a run is never blocked by it.
export const MAX_OPEN_FEATURES = 2;

export function openFeatureWarnings(features: Feature[]): FeatureValidationIssue[] {
	const open = features
		.filter((feature) => feature.status === 'in_progress')
		.map((feature) => feature.directory ?? feature.id)
		.sort();
	if (open.length <= MAX_OPEN_FEATURES) return [];
	const message =
		`${open.length} features are in_progress (more than ${MAX_OPEN_FEATURES}): ${open.join(', ')}. ` +
		'Selection resumes started work before any higher-priority backlog item, so finish or ' +
		'return one to backlog before starting another';
	return open.map((id) => ({ id, message }));
}

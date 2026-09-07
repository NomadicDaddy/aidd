import type {
	DirectorBacklogItemSummary,
	DirectorPrioritizedWork,
	DirectorPriorityTaskType,
} from './types.ts';

export interface TargetedWorkOptions {
	granularity: 'aggregate' | 'targeted';
	maxPerBucket: number;
}

// Backlog buckets whose aggregate work item carries an `evidence.top` array of concrete
// artifacts. Only these can be expanded into per-artifact, individually-runnable suggestions.
const expandableTaskTypes: ReadonlySet<DirectorPriorityTaskType> =
	new Set<DirectorPriorityTaskType>([
		'audit_backlog',
		'feature_completion',
		'remediation_backlog',
	]);

const targetedVerb: Record<string, string> = {
	audit_backlog: 'remediate',
	feature_completion: 'complete feature',
	remediation_backlog: 'resolve',
};

const rollupLabel: Record<string, string> = {
	audit_backlog: 'audit findings',
	feature_completion: 'backlog features',
	remediation_backlog: 'remediation items',
};

// Expands each aggregate backlog bucket ("resolve audit backlog") into one suggestion per
// concrete artifact (top `maxPerBucket` by priority/severity) plus a single rollup item for
// the remainder. This runs only when producing the fleet summary's `prioritizedWork`; the
// unexpanded `work` still feeds `buildPriorityHealth`, so health scoring is unchanged.
export function expandTargetedWork(
	work: DirectorPrioritizedWork[],
	options: TargetedWorkOptions,
): DirectorPrioritizedWork[] {
	if (options.granularity !== 'targeted') return work;
	const maxPerBucket = Math.max(1, Math.floor(options.maxPerBucket));
	return work.flatMap((item) => expandWorkItem(item, maxPerBucket));
}

function expandWorkItem(
	item: DirectorPrioritizedWork,
	maxPerBucket: number,
): DirectorPrioritizedWork[] {
	if (!expandableTaskTypes.has(item.taskType)) return [item];
	const top = Array.isArray(item.evidence.top)
		? (item.evidence.top as DirectorBacklogItemSummary[])
		: [];
	if (top.length === 0) return [item];
	// Reading, not identity: the expanded items inherit `projectId` verbatim below, so the title
	// may say `sample` while the item still targets exactly one of the two checkouts by that name.
	const projectName = item.projectName ?? item.projectId;
	const shown = top.slice(0, maxPerBucket);
	const total = typeof item.evidence.count === 'number' ? item.evidence.count : top.length;
	const expanded = shown.map((artifact) => buildTargetedItem(item, artifact, projectName, total));
	const remaining = total - shown.length;
	if (remaining > 0) {
		expanded.push(buildRollupItem(item, projectName, remaining, shown.length));
	}
	return expanded;
}

function buildTargetedItem(
	base: DirectorPrioritizedWork,
	artifact: DirectorBacklogItemSummary,
	projectName: string,
	bucketCount: number,
): DirectorPrioritizedWork {
	const verb = targetedVerb[base.taskType] ?? 'address';
	const label = artifact.title ?? artifact.id;
	// Drop the bucket-wide `top` array from per-artifact evidence; keep every other policy
	// field (profileAdjustment, maturityDeferred, profile, bySeverity, ...) so the carefully
	// computed profile/maturity context survives the split.
	const { top: _omitTop, ...baseEvidence } = base.evidence;
	return {
		evidence: {
			...baseEvidence,
			artifact,
			bucketCount,
			// count=1 (single artifact) and sourcePriority=the artifact's own priority so
			// sortPrioritizedWork ranks targeted items by their importance within the bucket.
			count: 1,
			sourcePriority: artifact.priority ?? 999,
		},
		projectId: base.projectId,
		...(base.projectName === undefined ? {} : { projectName: base.projectName }),
		rank: 0,
		// Keep the base reason (it carries the profile/maturity explanation) and prefix the
		// concrete artifact so the suggestion reads as a single pointed next action.
		reason: `${projectName}: ${verb} "${label}" (${artifact.id}). ${base.reason}`,
		// Inherit the bucket's policy-derived risk. The aggregate riskLevel already encodes the
		// profile escalation / low-exposure downgrade / maturity deferral — re-deriving it from
		// the raw artifact severity would silently undo those adjustments.
		riskLevel: base.riskLevel,
		suggestedArgs: targetedArgs(base.taskType, artifact.id),
		suggestedRecipe: base.suggestedRecipe,
		taskType: base.taskType,
		title: `${projectName}: ${verb} "${label}" (${artifact.id})`,
	};
}

function buildRollupItem(
	base: DirectorPrioritizedWork,
	projectName: string,
	remaining: number,
	shownCount: number,
): DirectorPrioritizedWork {
	const label = rollupLabel[base.taskType] ?? 'items';
	return {
		...base,
		// sourcePriority=999 keeps the rollup sorted after every targeted item in its bucket.
		evidence: { ...base.evidence, rolledUp: remaining, shown: shownCount, sourcePriority: 999 },
		rank: 0,
		reason: `${projectName} has ${remaining} more ${label} beyond the top ${shownCount}. ${base.reason}`,
		title: `${projectName}: + ${remaining} more ${label}`,
	};
}

function targetedArgs(taskType: DirectorPriorityTaskType, id: string): Record<string, string> {
	if (taskType === 'feature_completion') return { feature: id };
	return { filterBy: 'id', filterValue: id };
}

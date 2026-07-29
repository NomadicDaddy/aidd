import type {
	MilestoneCreateInput,
	MilestoneDeleteInput,
	MilestoneMove,
	MilestoneMoveReason,
	MilestoneUpdateInput,
	MilestoneWarningCode,
	ProjectMilestonePlan,
} from '../../../api/types.ts';

/**
 * A milestone mutation described independently of whether it is being previewed or applied. The
 * confirm step re-issues the very same request with `dryRun` cleared, so what the operator approved
 * and what runs cannot drift apart.
 */
export type MilestoneRequest =
	| { input: MilestoneCreateInput; kind: 'create' }
	| { input: MilestoneDeleteInput; kind: 'delete'; name: string }
	| { input: MilestoneUpdateInput; kind: 'update'; name: string }
	| { kind: 'reassign' };

export function milestoneRequestTitle(request: MilestoneRequest): string {
	switch (request.kind) {
		case 'create':
			return `Create milestone ${request.input.name}`;
		case 'delete':
			return `Delete milestone ${request.name}`;
		case 'reassign':
			return 'Auto-place features';
		case 'update':
			return `Edit milestone ${request.name}`;
	}
}

export function milestoneRequestVerb(request: MilestoneRequest): string {
	switch (request.kind) {
		case 'create':
			return 'created';
		case 'delete':
			return 'deleted';
		case 'reassign':
			return 'reassigned';
		case 'update':
			return 'updated';
	}
}

/**
 * Whether a previewed plan has to be confirmed before it is applied. Deletes always do — they are
 * irreversible and re-home every feature they held. Otherwise only consequences beyond the milestone
 * list itself force the stop: features changing milestone, warnings, or leftover violations. A pure
 * priority renumber is bookkeeping and would turn every reorder click into a two-step dialog.
 */
export function milestonePlanNeedsReview(
	plan: ProjectMilestonePlan,
	request: MilestoneRequest,
): boolean {
	if (request.kind === 'delete') return true;
	return (
		plan.moves.length > 0 ||
		plan.backfills.length > 0 ||
		plan.warnings.length > 0 ||
		plan.violations.length > 0
	);
}

const moveReasonLabels: Record<MilestoneMoveReason, string> = {
	'delete-cascade': 'milestone deleted',
	dependency: 'depends on later work',
	rename: 'milestone renamed',
	'shipped-version': 'placed by shipped version',
	unmapped: 'had no milestone',
};

export function moveReasonLabel(reason: MilestoneMoveReason): string {
	return moveReasonLabels[reason];
}

const warningLabels: Record<MilestoneWarningCode, string> = {
	dangling_dependency: 'Dependency not found',
	dependency_cycle: 'Dependency cycle',
	mvp_status_mismatch: 'Past the MVP boundary',
};

export function warningLabel(code: MilestoneWarningCode): string {
	return warningLabels[code];
}

export interface MilestoneMoveGroup {
	milestone: string;
	moves: MilestoneMove[];
}

/** Groups moves by destination so the dialog reads as "these features land here", not a flat list. */
export function groupMovesByTarget(moves: MilestoneMove[]): MilestoneMoveGroup[] {
	const groups = new Map<string, MilestoneMove[]>();
	for (const move of moves) {
		const existing = groups.get(move.to);
		if (existing) existing.push(move);
		else groups.set(move.to, [move]);
	}
	return [...groups.entries()].map(([milestone, grouped]) => ({
		milestone,
		moves: grouped.sort((a, b) => a.featureDirectory.localeCompare(b.featureDirectory)),
	}));
}

export function milestoneProgressLabel(completed: number, total: number): string {
	if (total === 0) return 'No features';
	return `${completed}/${total} passing`;
}

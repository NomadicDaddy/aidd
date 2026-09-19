import type { ScheduledTaskProjectScope } from 'aidd-shared/contracts/scheduled-tasks';

import type { ScheduleIssue } from './scheduleBuilder.ts';

/**
 * What the save gate needs to know about the target: its kind, and for a recipe whether that recipe
 * declares itself metadata-only. Modelled as a union so a recipe target cannot be described without
 * answering the question the scope rule asks of it.
 */
export type ScheduledSaveTarget =
	| { metadataOnly: boolean; type: 'recipe' }
	| { prompt: string; type: 'directive' }
	| { type: 'audit' | 'director' | 'skill' };

interface ScheduledSaveReadinessInput {
	applyChanges: boolean;
	confirmed: boolean;
	issue: null | ScheduleIssue;
	name: string;
	pending: boolean;
	projectScope: ScheduledTaskProjectScope;
	projectSelectionMissing: boolean;
	system: boolean;
	target: ScheduledSaveTarget;
	targetId: string;
}

interface ScheduledSaveReadiness {
	blocked: boolean;
	reason: null | string;
}

/**
 * The scope/target combinations the server refuses, stated here in the server's own sentences.
 *
 * This mirrors `assertScopeSupportsTarget` in `backend/src/services/scheduled/validator.ts`, which
 * stays exactly as it is — the server is the authority and does not trust a client. The point of
 * the copy is timing, not enforcement: without it the operator fills in a whole form, presses Save,
 * and reads the refusal as a failed request. The wording is copied deliberately, because the same
 * refusal phrased two ways reads as two different problems.
 */
export function scopeTargetIssue(
	projectScope: ScheduledTaskProjectScope,
	target: ScheduledSaveTarget,
): null | string {
	if (target.type === 'director') {
		// A fleet cycle reads every project through the fleet summary and belongs to none of them.
		return projectScope === 'none'
			? null
			: 'A Director cycle runs across the whole fleet, so it cannot target projects.';
	}
	if (projectScope !== 'none') return null;
	if (target.type === 'audit') {
		return 'Audits run against a project. Choose all projects or select the ones to audit.';
	}
	if (target.type === 'directive') {
		// A directive run is launched against a project, exactly as the Directive modal launches one.
		return 'Directives run against a project. Choose all projects or select the ones to run.';
	}
	if (target.type === 'recipe' && target.metadataOnly) {
		// A metadata-only session enforces its .aidd/-only write boundary through git, which the
		// applications root does not provide.
		return 'Metadata-only recipes run against a project. Choose all projects or select the ones to run.';
	}
	return null;
}

export function scheduledSaveReadiness({
	applyChanges,
	confirmed,
	issue,
	name,
	pending,
	projectScope,
	projectSelectionMissing,
	system,
	target,
	targetId,
}: ScheduledSaveReadinessInput): ScheduledSaveReadiness {
	if (pending) return { blocked: true, reason: null };
	// A directive has no catalog entry to choose: its prompt is what must be filled in instead.
	if (!system && target.type === 'directive' && !target.prompt.trim()) {
		return { blocked: true, reason: 'Enter the directive to run.' };
	}
	if (!system && target.type !== 'directive' && !targetId) {
		return { blocked: true, reason: 'Choose a target.' };
	}
	// Ahead of the project picker's own complaint: where both apply, the incompatibility explains
	// why no project selection would have helped.
	const scopeIssue = scopeTargetIssue(projectScope, target);
	if (scopeIssue) return { blocked: true, reason: scopeIssue };
	if (projectSelectionMissing) {
		return { blocked: true, reason: 'Select at least one project.' };
	}
	if (!system && applyChanges && !confirmed) {
		return { blocked: true, reason: 'Confirm the unattended-change consent above.' };
	}
	if (!name) return { blocked: true, reason: 'Enter a task name.' };
	if (issue) return { blocked: true, reason: issue.message };
	return { blocked: false, reason: null };
}

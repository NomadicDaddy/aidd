import type {
	ScheduledTask,
	ScheduledTaskProjectScope,
} from 'aidd-shared/contracts/scheduled-tasks';

import type { LaunchTargetValue } from '../../api/types/launchDefaults.ts';
import type { ScheduleBuilder } from './scheduleBuilder.ts';
import type { SelectableTargetType } from './targetBuilder.ts';

import { scheduleFormState } from './scheduleBuilder.ts';

/**
 * Every editable value in the scheduled-task form, as one object.
 *
 * Kept as data rather than as a handful of `useState` calls inside the form so that the page shell
 * and the form read the same draft: "is this form dirty?" is then a comparison two components can
 * both make, instead of a boolean one component computes and pushes to the other.
 */
export interface ScheduledDraft {
	applyChanges: boolean;
	args: string;
	builder: ScheduleBuilder;
	confirmed: boolean;
	cron: string;
	launchTarget: LaunchTargetValue;
	name: string;
	parameters: Record<string, string>;
	projects: string[];
	projectScope: ScheduledTaskProjectScope;
	runAt: string;
	targetId: string;
	targetType: SelectableTargetType;
	time: string;
	timezone: string;
	weekdays: string[];
}

/** The launch context carried in the query string, which seeds a new task's draft. */
export interface ScheduledDraftPreset {
	diaryPreset: boolean;
	presetId: string;
	presetType: SelectableTargetType;
}

export function draftPresetFromParams(params: URLSearchParams): ScheduledDraftPreset {
	const diaryPreset = params.get('preset') === 'diary';
	return {
		diaryPreset,
		presetId: params.get('id') ?? (diaryPreset ? 'diary-entry' : ''),
		presetType: (params.get('type') as null | SelectableTargetType) ?? 'skill',
	};
}

/** The draft a form opens with: an existing task's values, or the preset's, or empty. */
export function initialDraft(
	task: ScheduledTask | undefined,
	preset: ScheduledDraftPreset,
): ScheduledDraft {
	const target = task?.target;
	const schedule = scheduleFormState(task?.schedule);
	return {
		applyChanges:
			target?.type === 'skill'
				? target.executionIntent === 'apply-changes'
				: target?.type === 'recipe'
					? target.applyChanges
					: target?.type === 'audit'
						? !target.review
						: preset.diaryPreset || preset.presetType === 'recipe',
		args: target?.type === 'skill' ? target.args : '',
		builder: schedule.builder,
		confirmed: false,
		cron: schedule.cron,
		launchTarget: (target && target.type !== 'director' ? target.launchTarget : {}) ?? {},
		name: task?.name ?? (preset.diaryPreset ? 'Development diary' : ''),
		parameters: target?.type === 'recipe' ? (target.parameters ?? {}) : {},
		projects: task?.projects ?? [],
		projectScope: task?.projectScope ?? 'all',
		runAt: schedule.runAt,
		targetId:
			target?.type === 'recipe'
				? target.recipeId
				: target?.type === 'skill'
					? target.skillId
					: target?.type === 'audit'
						? target.auditAll
							? '*'
							: (target.auditNames[0] ?? '')
						: preset.presetId,
		// A built-in task's target never reaches this block: the form hides the target fields for it.
		targetType: target && target.type !== 'director' ? target.type : preset.presetType,
		time: schedule.time,
		timezone: schedule.timezone,
		weekdays: schedule.weekdays,
	};
}

/** Cadence changes alone, which a built-in task is allowed to make without touching its target. */
export function isScheduleDirty(draft: ScheduledDraft, initial: ScheduledDraft): boolean {
	return (
		draft.builder !== initial.builder ||
		draft.time !== initial.time ||
		JSON.stringify(draft.weekdays) !== JSON.stringify(initial.weekdays) ||
		draft.runAt !== initial.runAt ||
		draft.cron !== initial.cron ||
		draft.timezone !== initial.timezone
	);
}

/** Whether closing the form would lose anything the operator typed. */
export function isDraftDirty(draft: ScheduledDraft, initial: ScheduledDraft): boolean {
	return (
		draft.name !== initial.name ||
		draft.targetType !== initial.targetType ||
		draft.targetId !== initial.targetId ||
		draft.projectScope !== initial.projectScope ||
		JSON.stringify(draft.projects) !== JSON.stringify(initial.projects) ||
		isScheduleDirty(draft, initial) ||
		draft.args !== initial.args ||
		JSON.stringify(draft.parameters) !== JSON.stringify(initial.parameters) ||
		draft.applyChanges !== initial.applyChanges ||
		draft.confirmed !== initial.confirmed ||
		JSON.stringify(draft.launchTarget) !== JSON.stringify(initial.launchTarget)
	);
}

import type { ScheduledTask } from 'aidd-shared/contracts/scheduled-tasks';

import { type ReactNode, useState } from 'react';
import { useSearchParams } from 'react-router';

import type { ScheduledDraft, ScheduledDraftPreset } from './scheduledDraft.ts';
import type { ScheduledDraftPatch, ScheduledDraftValue } from './scheduledDraftContext.ts';

import {
	draftPresetFromParams,
	initialDraft,
	isDraftDirty,
	isScheduleDirty,
} from './scheduledDraft.ts';
import { ScheduledDraftContext } from './scheduledDraftContext.ts';

interface ScheduledFormState {
	draft: ScheduledDraft;
	editingId: null | string;
	initial: ScheduledDraft;
	open: boolean;
	scheduleTouched: boolean;
	task: ScheduledTask | undefined;
}

/** Every open of the form starts from this, so no action has to remember to clear a field. */
function openedOn(
	task: ScheduledTask | undefined,
	preset: ScheduledDraftPreset,
): ScheduledFormState {
	const initial = initialDraft(task, preset);
	return {
		draft: initial,
		editingId: task?.id ?? null,
		initial,
		open: true,
		scheduleTouched: false,
		task,
	};
}

/**
 * Route-local owner of the scheduled-task draft.
 *
 * The form and the page shell that guards its exits are siblings in the tree, and both need the
 * draft: the form to edit it, the shell to know whether closing or navigating away would lose it.
 * Holding it here makes "dirty" a value derived from the one draft, and every reset — closing the
 * form, switching to another task — a plain state transition in the action that caused it, rather
 * than an effect reacting to the change afterwards.
 */
export function ScheduledDraftProvider({ children }: { children: ReactNode }) {
	const [params] = useSearchParams();
	const preset = draftPresetFromParams(params);
	// Arriving with a query string (Run on a schedule, from a recipe, skill, audit, or the diary)
	// is a request to create that task, so the form is already open on that first render.
	const [state, setState] = useState<ScheduledFormState>(() => ({
		...openedOn(undefined, preset),
		open: params.size > 0,
	}));

	const value: ScheduledDraftValue = {
		close: () => setState({ ...openedOn(undefined, preset), open: false }),
		dirty: isDraftDirty(state.draft, state.initial),
		draft: state.draft,
		editingId: state.editingId,
		open: state.open,
		openEdit: (task) => setState(openedOn(task, preset)),
		openNew: () => setState(openedOn(undefined, preset)),
		patch: (update: ScheduledDraftPatch) =>
			setState((current) => ({
				...current,
				draft: {
					...current.draft,
					...(typeof update === 'function' ? update(current.draft) : update),
				},
			})),
		scheduleDirty: isScheduleDirty(state.draft, state.initial),
		scheduleTouched: state.scheduleTouched,
		task: state.task,
		touchSchedule: () =>
			setState((current) =>
				current.scheduleTouched ? current : { ...current, scheduleTouched: true },
			),
	};

	return <ScheduledDraftContext value={value}>{children}</ScheduledDraftContext>;
}

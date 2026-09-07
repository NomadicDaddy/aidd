import type { ScheduledTask } from 'aidd-shared/contracts/scheduled-tasks';

import { createContext, use } from 'react';

import type { ScheduledDraft } from './scheduledDraft.ts';

export type ScheduledDraftPatch =
	((current: ScheduledDraft) => Partial<ScheduledDraft>) | Partial<ScheduledDraft>;

/**
 * The scheduled form's draft, its dirty metadata, and the actions that open, edit, and close it.
 *
 * One authority, read by both the form and the page shell around it. The dirty flag is derived
 * here from the draft the provider already holds, so there is no second copy for an effect to keep
 * in step — which is what the page shell used to do, one render behind the truth.
 */
export interface ScheduledDraftValue {
	/** Close the form and discard the draft. */
	close: () => void;
	dirty: boolean;
	draft: ScheduledDraft;
	editingId: null | string;
	open: boolean;
	openEdit: (task: ScheduledTask) => void;
	openNew: () => void;
	patch: (update: ScheduledDraftPatch) => void;
	/** Cadence-only dirtiness, which is all a built-in task may change. */
	scheduleDirty: boolean;
	/** Whether the operator has asked for validation, which unhides schedule field errors. */
	scheduleTouched: boolean;
	task: ScheduledTask | undefined;
	touchSchedule: () => void;
}

export const ScheduledDraftContext = createContext<null | ScheduledDraftValue>(null);

/** The scheduled form draft supplied by the route's provider. */
export function useScheduledDraft(): ScheduledDraftValue {
	const value = use(ScheduledDraftContext);
	if (value === null) {
		throw new Error('Scheduled form consumers must be rendered inside ScheduledDraftProvider.');
	}
	return value;
}
